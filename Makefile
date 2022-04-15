.PHONY: all
all: build

.PHONY: build
build:
	@echo "Building..."
	cd local && docker-compose -f docker-compose-local.yaml up --build