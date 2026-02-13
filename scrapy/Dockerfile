FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app.py .

# Expose FastAPI port
EXPOSE 6800

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:6800/health')" || exit 1

# Run the server
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "6800"]
