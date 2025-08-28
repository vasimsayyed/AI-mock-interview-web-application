import { useAuth } from "@clerk/clerk-react";
import {
  CircleStop,
  Loader,
  Mic,
  RefreshCw,
  Save,
  Video,
  VideoOff,
  WebcamIcon,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import useSpeechToText, { ResultType } from "react-hook-speech-to-text";
import { useParams } from "react-router-dom";
import WebCam from "react-webcam";
import { TooltipButton } from "./tooltip-button";
import { toast } from "sonner";
import { chatSession } from "@/scripts";
import { SaveModal } from "./save-modal";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/config/firebase.config";

interface RecordAnswerProps {
  question: { question: string; answer: string };
  isWebCam: boolean;
  setIsWebCam: (value: boolean) => void;
}

interface AIResponse {
  ratings: number;
  feedback: string;
}

export const RecordAnswer = ({
  question,
  isWebCam,
  setIsWebCam,
}: RecordAnswerProps) => {
  const {
    interimResult,
    results,
    startSpeechToText,
    stopSpeechToText,
    error: speechError,
  } = useSpeechToText({
    continuous: true,
    useLegacyResults: false,
  });

  const [userAnswer, setUserAnswer] = useState("");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<AIResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isMicRecording, setIsMicRecording] = useState(false);
  const [noSpeechDetected, setNoSpeechDetected] = useState(false);
  const { userId } = useAuth();
  const { interviewId } = useParams();
  const speechTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  const handleRecording = async () => {
    if (isMicRecording) {
      // Stop recording
      stopRecording();
      return;
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Immediately stop using the stream
      
      setNoSpeechDetected(false);
      setUserAnswer("");
      setAiResult(null);
      
      try {
        await startSpeechToText();
        setIsMicRecording(true);
        
        // Set timeout to detect if no speech is coming through
        speechTimeoutRef.current = setTimeout(() => {
          if (!interimResult && results.length === 0) {
            setNoSpeechDetected(true);
            stopRecording();
          }
        }, 5000); // 5 seconds with no speech detection
      } catch (err) {
        console.error("Speech recognition failed:", err);
        toast.error("Speech recognition failed. Try refreshing the page.");
        setIsMicRecording(false);
      }
    } catch (err) {
      console.error("Microphone access denied:", err);
      toast.error("Microphone Access Denied", {
        description: "Please allow microphone access to record your answer.",
      });
    }
  };

  const stopRecording = () => {
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
    }
    stopSpeechToText();
    setIsMicRecording(false);
    
    if (userAnswer?.length < 30 && results.length > 0) {
      toast.error("Error", {
        description: "Your answer should be more than 30 characters",
      });
      return;
    }
    
    if (results.length > 0) {
      generateResult(question.question, question.answer, userAnswer)
        .then(setAiResult);
    }
  };

  const cleanJsonResponse = (responseText: string) => {
    let cleanText = responseText.trim();
    cleanText = cleanText.replace(/(json|```|`)/g, "");

    try {
      return JSON.parse(cleanText);
    } catch (error) {
      throw new Error("Invalid JSON format: " + (error as Error)?.message);
    }
  };

  const generateResult = async (
    qst: string,
    qstAns: string,
    userAns: string
  ): Promise<AIResponse> => {
    setIsAiGenerating(true);
    try {
      const prompt = `
        Question: "${qst}"
        User Answer: "${userAns}"
        Correct Answer: "${qstAns}"
        Please compare the user's answer to the correct answer, and provide a rating (from 1 to 10) based on answer quality, and offer feedback for improvement.
        Return the result in JSON format with the fields "ratings" (number) and "feedback" (string).
      `;

      const aiResult = await chatSession.sendMessage(prompt);
      return cleanJsonResponse(aiResult.response.text());
    } catch (error) {
      console.log(error);
      toast.error("Error generating feedback");
      return { ratings: 0, feedback: "Unable to generate feedback" };
    } finally {
      setIsAiGenerating(false);
    }
  };

  const recordNewAnswer = () => {
    stopRecording();
    setUserAnswer("");
    setAiResult(null);
    setNoSpeechDetected(false);
  };

  const saveUserAnswer = async () => {
    if (!aiResult) return;

    setLoading(true);
     try {
    const userAnswerQuery = query(
      collection(db, "userAnswers"),
      where("userId", "==", userId),
      where("question", "==", question.question),
      where("mockIdRef", "==", interviewId)
    );

    const querySnapshot = await getDocs(userAnswerQuery);

    if (!querySnapshot.empty) {
      toast.info("Already Answered");
      return;
    }

    await addDoc(collection(db, "userAnswers"), {
      mockIdRef: interviewId,
      question: question.question,
      correct_ans: question.answer,
      user_ans: userAnswer,
      feedback: aiResult.feedback,
      rating: aiResult.ratings,
      userId: userId,
      createdAt: serverTimestamp(),
    });

    toast.success("Answer saved successfully");
    setOpen(false);
  } catch (error) {
      toast.error("Error saving answer");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const combineTranscripts = results
      .filter((result): result is ResultType => typeof result !== "string")
      .map((result) => result.transcript)
      .join(" ");
    setUserAnswer(combineTranscripts);
    
    // Reset no speech detection if we get results
    if (results.length > 0 && noSpeechDetected) {
      setNoSpeechDetected(false);
    }
  }, [results, noSpeechDetected]);

  useEffect(() => {
    return () => {
      if (speechTimeoutRef.current) {
        clearTimeout(speechTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="w-full flex flex-col items-center gap-8 mt-4">
      <SaveModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={saveUserAnswer}
        loading={loading}
      />

      <div className="w-full h-[400px] md:w-96 flex flex-col items-center justify-center border p-4 bg-gray-50 rounded-md">
        {isWebCam ? (
          <WebCam
            onUserMedia={() => setIsWebCam(true)}
            onUserMediaError={() => setIsWebCam(false)}
            className="w-full h-full object-cover rounded-md"
          />
        ) : (
          <WebcamIcon className="min-w-24 min-h-24 text-muted-foreground" />
        )}
      </div>

      <div className="flex flex-col items-center gap-3 w-full">
        <div className="flex items-center justify-center gap-3">
          <TooltipButton
            content={isWebCam ? "Turn Off" : "Turn On"}
            icon={
              isWebCam ? (
                <VideoOff className="min-w-5 min-h-5" />
              ) : (
                <Video className="min-w-5 min-h-5" />
              )
            }
            onClick={() => setIsWebCam(!isWebCam)}
          />

          <TooltipButton
            content={isMicRecording ? "Stop Recording" : "Start Recording"}
            icon={
              isMicRecording ? (
                <CircleStop className="min-w-5 min-h-5" />
              ) : (
                <Mic className="min-w-5 min-h-5" />
              )
            }
            onClick={handleRecording}
            disbaled={isAiGenerating}
          />

          <TooltipButton
            content="Record Again"
            icon={<RefreshCw className="min-w-5 min-h-5" />}
            onClick={recordNewAnswer}
            disbaled={isMicRecording || isAiGenerating}
          />

          <TooltipButton
            content="Save Result"
            icon={
              isAiGenerating ? (
                <Loader className="min-w-5 min-h-5 animate-spin" />
              ) : (
                <Save className="min-w-5 min-h-5" />
              )
            }
            onClick={() => setOpen(true)}
            disbaled={!aiResult || isMicRecording}
          />
        </div>

        {(noSpeechDetected || speechError) && (
          <div className="mt-2 text-center">
            <p className="text-sm text-red-500">
              {speechError ? 
                "Speech recognition error. Please refresh and try again." : 
                "No speech detected. Please check your microphone and try again."}
            </p>
            {!speechError && (
              <button 
                onClick={handleRecording}
                className="text-sm text-blue-500 hover:text-blue-700 mt-1"
              >
                Try again
              </button>
            )}
          </div>
        )}
      </div>

      <div className="w-full mt-4 p-4 border rounded-md bg-gray-50">
        <h2 className="text-lg font-semibold">Your Answer:</h2>
        <p className="text-sm mt-2 text-gray-700 whitespace-normal">
          {userAnswer || "Start recording to see your answer here"}
        </p>

        {interimResult && (
          <p className="text-sm text-gray-500 mt-2">
            <strong>Current Speech:</strong> {interimResult}
          </p>
        )}

        {aiResult && (
          <div className="mt-4">
            <h3 className="font-medium">Feedback:</h3>
            <p className="text-sm text-gray-700">{aiResult.feedback}</p>
            <p className="text-sm mt-1">
              Rating: <span className="font-medium">{aiResult.ratings}/10</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};