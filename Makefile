.DEFAULT_GOAL := help

YARN ?= yarn

.PHONY: help install run dev build preview lint test typecheck css-types

help:
	@printf '%s\n' \
		'make install   Install dependencies' \
		'make run       Start the Vite development server' \
		'make build     Create a production build' \
		'make preview   Preview the production build locally' \
		'make lint      Run ESLint' \
		'make test      Run Vitest' \
		'make typecheck Run the TypeScript checker' \
		'make css-types Refresh CSS module declarations'

install:
	$(YARN) install

run:
	$(YARN) dev

dev: run

build:
	$(YARN) build

preview:
	$(YARN) preview

lint:
	$(YARN) lint

test:
	$(YARN) test

typecheck:
	$(YARN) typecheck

css-types:
	$(YARN) css-types
