quickStart:
	docker network create mongo-net
	docker run -d --name mongodb --network mongo-net -p 27017:27017 mongo:7
	docker run -d --name mongoku --network mongo-net -p 3100:3100 -e MONGOKU_DEFAULT_HOST=mongodb://mongodb:27017 huggingface/mongoku

quickStop:
	docker stop mongodb
	docker rm mongodb
	docker stop mongoku
	docker rm mongoku
	docker network rm mongo-net

build:
	go mod download
	CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o cpak main.go
	./cpak 