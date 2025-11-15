# Multi-stage Dockerfile for cpak application

# Stage 1: Build frontend WASM
FROM golang:1.21-alpine AS wasm-builder

WORKDIR /build

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy frontend source
COPY frontend/ ./frontend/

# Build WASM
RUN GOARCH=wasm GOOS=js go build -o web/app.wasm ./frontend

# Stage 2: Build backend binary
FROM golang:1.21-alpine AS backend-builder

WORKDIR /build

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy all source files
COPY . .

# Copy WASM from previous stage
COPY --from=wasm-builder /build/web/app.wasm ./web/app.wasm

# Build the application (MongoDB version)
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o cpak main_v2.go

# Stage 3: Final runtime image
FROM alpine:latest

# Install ca-certificates for HTTPS requests and wget for healthcheck
RUN apk --no-cache add ca-certificates tzdata wget

WORKDIR /app

# Copy binary from builder
COPY --from=backend-builder /build/cpak .

# Copy web assets
COPY --from=backend-builder /build/web ./web

# Create non-root user
RUN addgroup -g 1000 cpak && \
    adduser -D -u 1000 -G cpak cpak && \
    chown -R cpak:cpak /app

USER cpak

# Expose ports
EXPOSE 8080 8081

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

# Set environment variables
ENV MONGODB_URI=mongodb://mongodb:27017

# Run the application
CMD ["./cpak"]
