# syntax=docker/dockerfile:1

# ---------- build stage ----------
FROM golang:1.25-alpine AS build

WORKDIR /src

# Cache module downloads
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Pure-Go SQLite (modernc.org/sqlite) — no CGO needed
ENV CGO_ENABLED=0 \
    GOOS=linux

RUN go build -trimpath -ldflags="-s -w" -o /out/turn2sql ./

# ---------- runtime stage ----------
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 app

WORKDIR /app

# Binary + assets the server reads via relative paths (./templates, ./static)
COPY --from=build /out/turn2sql /app/turn2sql
COPY --from=build /src/templates /app/templates
COPY --from=build /src/static    /app/static

# Persist SQLite on /app/data (mount as a volume)
RUN mkdir -p /app/data && chown -R app:app /app
USER app

ENV DATABASE_PATH=/app/data/data.db

EXPOSE 8000
VOLUME ["/app/data"]

CMD ["/app/turn2sql"]
