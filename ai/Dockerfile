# Start from an image that already has Python inside.
FROM python:3.12

# Set the working folder inside the container.
# We use /code because our Python package is already named "app".
# Two things named "app" would be confusing.
WORKDIR /code

# Copy the library list first.
# Docker saves this step. If the list does not change,
# Docker skips the slow install next time.
COPY requirements.txt ./

# Install the libraries.
RUN pip install --no-cache-dir -r requirements.txt

# Copy everything else (main.py and the app folder).
COPY . .

# The container listens on port 8000.
EXPOSE 8000

# When the container starts, run this.
# --host 0.0.0.0 means: let other containers reach me.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
