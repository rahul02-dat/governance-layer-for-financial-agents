FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set pythonpath so alembic can find app
ENV PYTHONPATH=/app

# Expose port
EXPOSE 8000

# Start server (in a real prod environment we'd use a script to run migrations first)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
