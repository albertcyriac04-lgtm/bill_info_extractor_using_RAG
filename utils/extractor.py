import os
import json
import base64
from pypdf import PdfReader
from openai import OpenAI

def extract_pdf_text(file_path: str) -> str:
    """Extract text from a digital PDF file."""
    reader = PdfReader(file_path)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text.strip()

def encode_image_to_base64(file_path: str) -> str:
    """Encode an image file to a base64 string."""
    with open(file_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")

def extract_structured_bill_data(file_path: str, api_key: str, model_text: str = "llama-3.3-70b-versatile", model_vision: str = "llama-3.2-11b-vision-preview") -> dict:
    """
    Extract key invoice details using Groq API.
    If PDF: extract text locally first and use text model.
    If Image: encode to base64 and use vision model.
    """
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1"
    )

    _, ext = os.path.splitext(file_path.lower())
    
    system_prompt = (
        "You are an expert document parser. Your task is to extract structured information from the provided invoice/bill. "
        "You MUST return a JSON object with the following fields:\n"
        "{\n"
        "  \"vendor_name\": \"Name of the service provider or merchant\",\n"
        "  \"invoice_number\": \"Invoice or bill number, or null if not found\",\n"
        "  \"invoice_date\": \"Date of issue (format: YYYY-MM-DD, or null if not found)\",\n"
        "  \"due_date\": \"Due date of the payment (format: YYYY-MM-DD, or null if not found)\",\n"
        "  \"total_amount\": 123.45 (float, total due/paid including tax, or null if not found),\n"
        "  \"tax_amount\": 12.34 (float, tax amount, or null if not found),\n"
        "  \"currency\": \"Three-letter currency code (e.g. USD, EUR, INR, or null if not found)\",\n"
        "  \"line_items\": [\n"
        "    {\n"
        "      \"description\": \"Item or service description\",\n"
        "      \"quantity\": 1 (integer, default to 1 if not specified),\n"
        "      \"unit_price\": 123.45 (float, price per item),\n"
        "      \"total_price\": 123.45 (float, total price for this line item)\n"
        "    }\n"
        "  ],\n"
        "  \"summary\": \"Brief 1-2 sentence summary of what the invoice contains\"\n"
        "}\n"
        "Make sure the response is a valid JSON object. Do not include any formatting or conversational text around the JSON object."
    )

    if ext == ".pdf":
        text = extract_pdf_text(file_path)
        if not text:
            raise ValueError("Could not extract any text from the PDF. It might be scanned. Please upload a PNG/JPG screenshot instead.")
        
        prompt = f"Extract information from this invoice text:\n\n{text}"
        
        response = client.chat.completions.create(
            model=model_text,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )
    elif ext in [".png", ".jpg", ".jpeg"]:
        base64_image = encode_image_to_base64(file_path)
        mime_type = f"image/{ext[1:]}" if ext != ".jpg" else "image/jpeg"
        
        response = client.chat.completions.create(
            model=model_vision,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract all structured details from this invoice image."},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )
    else:
        raise ValueError(f"Unsupported file format: {ext}. Only PDF, PNG, JPG are supported.")

    result_text = response.choices[0].message.content
    try:
        data = json.loads(result_text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Model did not return valid JSON. Raw output: {result_text}") from e
        
    return data
