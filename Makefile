SHELL := /bin/bash

IMAGE ?= cloudfinops-site
VERSION ?= $(shell node -p "require('./package.json').version")
PLATFORM ?= linux/amd64
PORT ?= 3000

.PHONY: help version data build docker release run clean

help:
	@echo "Targets:"
	@echo "  make data     - build catalog JSON from prices/"
	@echo "  make build    - next production build (includes data:build)"
	@echo "  make docker   - docker image for $(PLATFORM)"
	@echo "  make release  - npm build + docker build ($(PLATFORM))"
	@echo "  make run      - run local image on :$(PORT)"
	@echo "  make version  - print image tag"

version:
	@echo "$(IMAGE):$(VERSION) ($(PLATFORM))"

data:
	npm run data:build

build:
	npm run build

docker:
	docker buildx build \
		--platform $(PLATFORM) \
		--tag $(IMAGE):$(VERSION) \
		--tag $(IMAGE):latest \
		--load \
		.

release: build docker
	@echo "Released $(IMAGE):$(VERSION) for $(PLATFORM)"

run:
	docker run --rm -p $(PORT):3000 $(IMAGE):$(VERSION)

clean:
	rm -rf .next out
