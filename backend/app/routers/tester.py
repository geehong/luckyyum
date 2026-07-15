from fastapi import APIRouter
from fastapi.responses import HTMLResponse
import os

router = APIRouter(tags=["Tester"])

@router.get("/demo")
async def get_tester_page():
    # Read the HTML file and return it
    current_dir = os.path.dirname(os.path.abspath(__file__))
    html_path = os.path.join(current_dir, "..", "pages", "tester.html")
    
    try:
        with open(html_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        return HTMLResponse(content=html_content, status_code=200)
    except FileNotFoundError:
        return HTMLResponse(content="<h1>Tester page not found.</h1>", status_code=404)
