import os
import json
import re

def clean_json_response(text):
    """
    Cleans markdown formatting from LLM JSON responses if present.
    """
    text = text.strip()
    # Remove markdown code blocks if the model wrapped the JSON
    if text.startswith("```"):
        # find second occurrence of ```
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
        if match:
            text = match.group(1).strip()
    return text

def parse_brain_dump(content):
    """
    Parses a raw brain dump text and returns a list of actionable todo strings.
    First tries OpenAI/Gemini, and falls back to line-by-line parsing if keys aren't configured or fail.
    """
    if not content or not content.strip():
        return []

    gemini_key = os.getenv('GEMINI_API_KEY')
    openai_key = os.getenv('OPENAI_API_KEY')
    
    # Clean default placeholders from template .env
    if gemini_key == "your_gemini_api_key_here":
        gemini_key = None
    if openai_key == "your_openai_api_key_here":
        openai_key = None

    prompt = (
        "You are an assistant that extracts high-level, meaningful tasks from a person's raw brain dump.\n"
        "\n"
        "Rules:\n"
        "1. Identify GOALS, not micro-steps. If several phrases all serve one purpose (e.g. 'run models on the server to get results'), keep them as ONE task.\n"
        "2. Only create a separate task when the action is genuinely independent — a different area of work or a different deliverable.\n"
        "3. Ignore filler connectors ('and then', 'also', 'in order to') — they do NOT mean a new task.\n"
        "4. Ignore intent/context phrases like 'think in lines of', 'to achieve', 'properly' — absorb them into the parent task wording.\n"
        "5. Aim for 3–7 concise tasks maximum. Each task should be immediately understandable with no extra context.\n"
        "6. Write each task as a short, clear action phrase (e.g. 'Run models on server and validate results').\n"
        "\n"
        "Return ONLY a raw JSON list of strings, for example:\n"
        "[\"Read the research paper\", \"Design flow diagram in Excalidraw\", \"Run models on server and validate results\"]\n"
        "Do not include any markdown blocks (like ```json) or explanation. Return raw JSON text only."
    )

    errors = []

    # Try Gemini
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(f"{prompt}\n\nBrain Dump:\n{content}")
            result_text = clean_json_response(response.text)
            todos = json.loads(result_text)
            if isinstance(todos, list):
                return [str(t).strip() for t in todos if t]
        except Exception as e:
            err_msg = f"Gemini API Error: {e}"
            errors.append(err_msg)
            print(err_msg)

    # Try OpenAI
    if openai_key:
        try:
            from openai import OpenAI
            api_key = openai_key.strip("'\"")
            
            # Auto-detect Groq keys and adjust base_url/model
            if api_key.startswith("gsk_"):
                client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
                model_name = "llama-3.1-8b-instant"
            else:
                client = OpenAI(api_key=api_key)
                model_name = "gpt-4o-mini"
                
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": content}
                ],
                temperature=0.3,
            )
            result_text = clean_json_response(response.choices[0].message.content)
            todos = json.loads(result_text)
            if isinstance(todos, list):
                return [str(t).strip() for t in todos if t]
        except Exception as e:
            err_msg = f"OpenAI/Groq API Error: {e}"
            errors.append(err_msg)
            print(err_msg)

    # Error handling when API extraction is unavailable or fails
    if not gemini_key and not openai_key:
        raise ValueError("No LLM API keys configured. Please set GEMINI_API_KEY or OPENAI_API_KEY in your settings/.env file.")
    else:
        raise RuntimeError(f"Brain dump parsing failed. API error details: {' | '.join(errors)}")


def generate_ai_reflection(notes):
    """
    Analyzes notes of how the day went, and returns a tuple (mistakes, suggestions).
    Both contain bulleted markdown text.
    """
    default_mistakes = "- No specific mistakes identified. Reflect on what could be improved."
    default_suggestions = "- Maintain consistency with your routines.\n- Plan tomorrow's primary task first thing."
    
    if not notes or not notes.strip():
        return default_mistakes, default_suggestions

    gemini_key = os.getenv('GEMINI_API_KEY')
    openai_key = os.getenv('OPENAI_API_KEY')
    
    if gemini_key == "your_gemini_api_key_here":
        gemini_key = None
    if openai_key == "your_openai_api_key_here":
        openai_key = None

    prompt = (
        "You are an assistant that analyzes a person's daily reflection notes.\n"
        "Extract:\n"
        "1. Mistakes to not repeat tomorrow\n"
        "2. Suggestions for tomorrow\n\n"
        "Return ONLY a JSON object with two fields \"mistakes\" and \"suggestions\", both containing bullet points formatted in clean Markdown.\n"
        "Example:\n"
        "{\n"
        "  \"mistakes\": \"- Procrastinated on the report\\n- Drank coffee too late\",\n"
        "  \"suggestions\": \"- Start with the hardest task first thing in the morning\\n- Keep caffeine before 2 PM\"\n"
        "}\n"
        "Do not include any markdown blocks or explanation. Return raw JSON text only."
    )

    # Try Gemini
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(f"{prompt}\n\nReflection notes:\n{notes}")
            result_text = clean_json_response(response.text)
            data = json.loads(result_text)
            return data.get('mistakes', default_mistakes), data.get('suggestions', default_suggestions)
        except Exception as e:
            print(f"Gemini API Error in reflection: {e}")

    # Try OpenAI
    if openai_key:
        try:
            from openai import OpenAI
            api_key = openai_key.strip("'\"")
            
            # Auto-detect Groq keys and adjust base_url/model
            if api_key.startswith("gsk_"):
                client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
                model_name = "llama-3.1-8b-instant"
            else:
                client = OpenAI(api_key=api_key)
                model_name = "gpt-4o-mini"
                
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": notes}
                ],
                temperature=0.3,
            )
            result_text = clean_json_response(response.choices[0].message.content)
            data = json.loads(result_text)
            return data.get('mistakes', default_mistakes), data.get('suggestions', default_suggestions)
        except Exception as e:
            print(f"OpenAI/Groq API Error in reflection: {e}")

    # Fallback: Basic rule-based analysis
    print("Falling back to local reflection analyzer")
    mistakes_list = []
    suggestions_list = []
    
    notes_lower = notes.lower()
    
    # Basic keyword mapping
    if any(k in notes_lower for k in ["distracted", "phone", "social media", "procrastinate", "youtube"]):
        mistakes_list.append("- Allowed digital distractions (phone/social media) to break focus.")
        suggestions_list.append("- Keep phone in another room or use website blockers during focus hours.")
    
    if any(k in notes_lower for k in ["tired", "sleep", "exhausted", "late"]):
        mistakes_list.append("- Energy levels were low (felt tired or worked too late).")
        suggestions_list.append("- Prioritize a consistent wind-down routine and 7-8 hours of sleep.")
        
    if any(k in notes_lower for k in ["caffeine", "coffee"]):
        mistakes_list.append("- Caffeine consumption timing or amount may have disrupted focus/sleep.")
        suggestions_list.append("- Try cutting off caffeine intake at least 8 hours before bed.")

    if any(k in notes_lower for k in ["forgot", "missed"]):
        mistakes_list.append("- Important tasks were forgotten or overlooked.")
        suggestions_list.append("- Update the Eisenhower matrix immediately when new tasks come up.")

    if not mistakes_list:
        mistakes_list.append("- No obvious pattern identified. Keep writing detailed daily logs to help the AI extract insights.")
    if not suggestions_list:
        suggestions_list.append("- Try breaking down complex tasks into smaller, manageable sub-todos.")
        suggestions_list.append("- Schedule your hardest task during your peak energy hours.")
        
    return "\n".join(mistakes_list), "\n".join(suggestions_list)
