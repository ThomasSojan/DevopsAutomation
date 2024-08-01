FROM golang:1.22 as builder
WORKDIR /workspace
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o con-manager cmd/conn-mgr/main.go
