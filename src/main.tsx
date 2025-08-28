import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { BrowserRouter } from 'react-router-dom' // 👈 1. Import BrowserRouter

import './index.css'
import App from './App.tsx'

// Import your Publishable Key
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Publishable Key')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      {/* 👇 2. Wrap your App component to fix routing */}
      <BrowserRouter basename="/AI-mock-interview-web-application/">
        <App />
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>,
)