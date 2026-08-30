import os
import tempfile
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Import extraction and RAG helper functions
from utils.extractor import extract_structured_bill_data
from utils.rag import query_rag_engine

app = FastAPI(title="BillWise RAG API", version="1.0.0")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    query: str
    history: List[Dict[str, str]]
    bills: List[Dict[str, Any]]
    apiKey: Optional[str] = None
    model: Optional[str] = "llama-3.3-70b-versatile"
    apiBase: Optional[str] = "https://api.groq.com/openai/v1"

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "version": "1.0.0"}

@app.post("/api/upload")
async def upload_bill(
    file: UploadFile = File(...),
    apiKey: str = Form(...),
    textModel: str = Form("llama-3.3-70b-versatile"),
    visionModel: str = Form("llama-3.2-11b-vision-preview"),
    apiBase: str = Form("https://api.groq.com/openai/v1")
):
    """
    Endpoint to upload a bill (PDF/Image) and extract its structured details.
    Uses tempfile to save file state temporarily before calling Groq.
    """
    if not apiKey:
        raise HTTPException(status_code=400, detail="Groq API Key is required.")
        
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in [".pdf", ".png", ".jpg", ".jpeg"]:
        raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}. Only PDF, PNG, and JPG/JPEG are supported.")
        
    # Write file to a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
        content = await file.read()
        temp_file.write(content)
        temp_file_path = temp_file.name
        
    try:
        # Extract structured details
        data = extract_structured_bill_data(
            temp_file_path,
            apiKey,
            model_text=textModel,
            model_vision=visionModel,
            api_base=apiBase
        )
        # Append original filename to the response data
        data["_filename"] = file.filename
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.post("/api/chat")
async def chat_rag(request: ChatRequest):
    """
    Endpoint to query the RAG pipeline about uploaded invoices.
    Streams the response back using Serverless Streaming.
    """
    api_key = request.apiKey or os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="Groq API Key is required.")
        
    if not request.bills:
        raise HTTPException(status_code=400, detail="At least one processed bill context is required.")
        
    def response_generator():
        try:
            # Streams chunks directly from the query engine
            for chunk in query_rag_engine(
                request.query,
                request.history,
                request.bills,
                api_key,
                model=request.model,
                api_base=request.apiBase
            ):
                yield chunk
        except Exception as e:
            yield f"\n[Error: {str(e)}]"

    return StreamingResponse(response_generator(), media_type="text/plain")
