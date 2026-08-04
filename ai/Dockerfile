# Start from an image that already has Python installed.
FROM python:3.12

# Set the working folder inside the container.
WORKDIR /app

# Copy the list of Python libraries first.
COPY requirements.txt ./

# Install those libraries.
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the code.
COPY . .

# The container listens on port 8000.
EXPOSE 8000

# Run the FastAPI app. --host 0.0.0.0 lets other containers reach it.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]