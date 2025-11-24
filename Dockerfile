# Multi-stage Dockerfile for cpak application with Templ + HTMX

# Stage 1: Build application binary
FROM golang:1.24.10-alpine AS builder

WORKDIR /build

# Install templ CLI
RUN go install github.com/a-h/templ/cmd/templ@latest

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy all source files
COPY . .

# Generate Go code from Templ templates
RUN /go/bin/templ generate

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o cpak main.go

# Stage 3: Final runtime image
FROM alpine:latest

# Install ca-certificates for HTTPS requests and wget for healthcheck
RUN apk --no-cache add ca-certificates tzdata wget

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/cpak .

# Copy web assets (static files only, no WASM needed)
COPY --from=builder /build/web/static ./web/static

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
