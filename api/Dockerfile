# Start from an image that already has Go installed.
FROM golang:1.26

# Set the working folder inside the container.
WORKDIR /app

# Copy the module files first (go.sum is new, for the pgx library).
COPY go.mod go.sum ./

# Download the libraries listed in go.mod.
RUN go mod download

# Copy the rest of the code.
COPY . .

# Build the program into one file called "server".
RUN go build -o server ./cmd/server

# The container listens on port 8080.
EXPOSE 8080

# When the container starts, run our server.
CMD ["./server"]