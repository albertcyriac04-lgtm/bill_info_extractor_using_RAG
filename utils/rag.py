import os
import json
from openai import OpenAI

def load_processed_bills(processed_dir: str) -> list:
    """Load all JSON files containing structured bill data from the processed directory."""
    bills = []
    if not os.path.exists(processed_dir):
        return bills
        
    for filename in os.listdir(processed_dir):
        if filename.endswith(".json"):
            filepath = os.path.join(processed_dir, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    bill_data = json.load(f)
                    # Add metadata about filename for tracking
                    bill_data["_filename"] = filename
                    bills.append(bill_data)
            except Exception as e:
                print(f"Error reading {filename}: {e}")
    return bills

def build_rag_context(bills: list) -> str:
    """Format structured bill data into an easy-to-read text context for the LLM."""
    if not bills:
        return "No bills have been uploaded or processed yet."
        
    context_lines = []
    context_lines.append(f"Total processed documents: {len(bills)}")
    context_lines.append("Here are the details of the available bills:")
    
    for i, bill in enumerate(bills, 1):
        context_lines.append(f"\n--- BILL {i} ---")
        context_lines.append(f"Vendor/Merchant: {bill.get('vendor_name', 'N/A')}")
        context_lines.append(f"Invoice Number: {bill.get('invoice_number', 'N/A')}")
        context_lines.append(f"Invoice Date: {bill.get('invoice_date', 'N/A')}")
        context_lines.append(f"Due Date: {bill.get('due_date', 'N/A')}")
        
        # Format total and tax
        total = bill.get('total_amount')
        tax = bill.get('tax_amount')
        currency = bill.get('currency', 'USD')
        
        context_lines.append(f"Total Amount Due/Paid: {total} {currency}" if total is not None else f"Total Amount: N/A {currency}")
        context_lines.append(f"Tax Amount: {tax} {currency}" if tax is not None else f"Tax Amount: N/A {currency}")
        context_lines.append(f"Brief Summary: {bill.get('summary', 'N/A')}")
        
        # Line Items
        items = bill.get('line_items', [])
        if items:
            context_lines.append("Line Items:")
            for item in items:
                desc = item.get('description', 'N/A')
                qty = item.get('quantity', 1)
                price = item.get('unit_price')
                total_p = item.get('total_price')
                
                price_str = f" @ {price} each" if price is not None else ""
                total_str = f" = {total_p} {currency}" if total_p is not None else ""
                context_lines.append(f"  - {desc} (Qty: {qty}{price_str}{total_str})")
        else:
            context_lines.append("Line Items: None specified.")
            
    return "\n".join(context_lines)

def query_rag_engine(query: str, history: list, bills: list, api_key: str, model: str = "llama-3.3-70b-versatile"):
    """
    Query the Groq API using a RAG prompt with all bills loaded as context.
    Yields chunks for streaming.
    """
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1"
    )
    
    bills_context = build_rag_context(bills)
    
    system_prompt = (
        "You are 'BillWise AI', a professional, helpful assistant for managing bills, receipts, and invoices. "
        "You have access to structured data extracted from the user's uploaded documents.\n\n"
        "Here is the context of all uploaded bills:\n"
        "======================================\n"
        f"{bills_context}\n"
        "======================================\n\n"
        "Instructions:\n"
        "1. Base your answers strictly on the bill context provided above.\n"
        "2. If the user asks for calculations (such as summing total spend, listing average bills, comparing two vendors, or looking at due dates), "
        "perform the arithmetic step-by-step and display your calculations clearly.\n"
        "3. Format your answers professionally using Markdown. Use tables for lists of items, bullet points for clarity, "
        "and bold text for totals and important metrics.\n"
        "4. If a question cannot be answered using the provided bills context, say so politely. Do not make up information.\n"
        "5. Respond in a clear, friendly, and structured manner."
    )
    
    # Construct message list: system prompt + history + user query
    messages = [{"role": "system", "content": system_prompt}]
    
    # Append conversation history (each item should be a dict with role and content)
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
        
    # Append current user query
    messages.append({"role": "user", "content": query})
    
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.2,
        stream=True
    )
    
    for chunk in response:
        content = chunk.choices[0].delta.content
        if content:
            yield content
