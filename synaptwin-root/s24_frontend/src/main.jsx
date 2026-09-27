/*
 * SynapTwin - Community Energy Flexibility & Shared-Battery Digital Twin
 * Copyright (c) 2026 Owais Ahmad
 * Author: Owais Ahmad (https://github.com/Owais-Ahmad777)
 * Licensed under the MIT License.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
