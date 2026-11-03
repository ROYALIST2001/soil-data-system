# Start from an image that already has Python inside.
FROM python:3.12-slim

# "slim" is smaller than the full image. Good on an 8GB laptop.

# Set the working folder.
# We use /code because our Python package is already named "app".
WORKDIR /code

# Copy the library list first, so Docker can cache this slow step.
COPY requirements.txt ./

# Install the libraries.
#
# --extra-index-url points pip at the CPU-ONLY PyTorch build.
# That is about 200 MB instead of 2.5 GB.
#
# IF YOUR WINNER IS random_forest, remove torch from requirements.txt
# and delete the --extra-index-url part. Saves about 800 MB.
#
# --timeout / --retries were added because the 196 MB PyTorch wheel
# stalls on a slow connection and fails the whole build with:
#   ReadTimeoutError: HTTPSConnectionPool(host='download-r2.pytorch.org')
# The pip cache mount lets a retry resume from what already downloaded,
# instead of starting the 196 MB again. Neither changes what is installed.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    --timeout 120 --retries 10

# Keep the small retrieval dependencies separate from the cached ML stack.
COPY requirements-agent.txt ./
RUN pip install --no-cache-dir -r requirements-agent.txt

# Copy everything else: main.py, the app package, and artifacts.
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
