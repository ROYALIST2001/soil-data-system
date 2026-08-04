# Start from an image that already has Go installed.
FROM golang:1.22

# Set the working folder inside the container.
WORKDIR /app

# Copy the Go module file first (this makes rebuilds faster).
COPY go.mod ./

# Download dependencies listed in go.mod.
RUN go mod download

# Copy the rest of the code.
COPY . .

# Build the program into one file called "server".
RUN go build -o server ./cmd/server

# The container listens on port 8080.
EXPOSE 8080

# When the container starts, run our server.
CMD ["./server"]