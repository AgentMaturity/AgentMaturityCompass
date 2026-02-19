.PHONY: install dev test lint docker-build docker-up

install:
	pip install -e .[dev]

dev:
	uvicorn amc.api.main:app --reload --host 0.0.0.0 --port 8080

test:
	pytest -q

lint:
	ruff check amc tests


docker-build:
	docker compose build

docker-up:
	docker compose up
