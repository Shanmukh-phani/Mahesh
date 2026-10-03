import uvicorn

from app.config import AI_PORT

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=AI_PORT, reload=True)
