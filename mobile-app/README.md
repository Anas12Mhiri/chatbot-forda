# Careway mobile app

This Expo Go client contains the patient and doctor interfaces. It uses JavaScript and targets Node.js 20.20.0 with Expo SDK 54.

## Start the chatbot API

Install Ollama and download the model once:

```powershell
ollama pull qwen3:1.7b
```

In a PowerShell terminal, start the API:

```powershell
cd mobile-app\backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:OLLAMA_MODEL = "qwen3:1.7b"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Keep Ollama and this API running while using the assistant. The phone and computer must be on the same Wi-Fi. Allow Python through Windows Firewall on private networks if prompted.

## Start Expo Go

In a second PowerShell terminal:

```powershell
cd mobile-app
npm install
npm start
```

Scan the Expo QR code with Expo Go. The mobile client connects to the API on port 8000 using the development host address.

Patient and doctor account records are stored securely on the device using Expo SecureStore. Accounts are local to that device; cross-device accounts require a production authentication service.
