SRC = src
BUILD ?= build
PROD-BUILD = prod-build
ZIP = knavi.zip
JS = build/background.js build/content-root.js build/content-all.js build/options.js
STATICS = $(patsubst $(SRC)/%, $(BUILD)/%, $(wildcard $(SRC)/*.html $(SRC)/*.css))
ICONS = $(addprefix $(BUILD)/icon, $(addsuffix .png, 16 48 128))
PNG = $(patsubst $(SRC)/%.svg, $(BUILD)/%.png, $(wildcard $(SRC)/*.svg))

FILES = $(BUILD) $(BUILD)/manifest.json $(STATICS) $(ICONS) $(PNG)

.PHONY: all
all: $(FILES) $(JS)

$(BUILD):
	mkdir -v $(BUILD)

$(BUILD)/manifest.json: $(SRC)/manifest.js package.json node_modules
	node scripts/jsonize-manifest.js > $@

$(BUILD)/%.js: $(SRC)/* $(SRC)/lib/* node_modules
	@echo execute webpack for $@
	DEST=$(BUILD) npx webpack

$(ICONS): $(SRC)/icon.svg
	rsvg-convert $< \
		--width `echo $@ | sed -nre 's/.*icon([0-9]+)\.png/\1/p'` \
		--keep-aspect-ratio \
		--output $@

$(BUILD)/%.png: $(SRC)/%.svg
	rsvg-convert $< \
		--width 40 \
		--keep-aspect-ratio \
		--output $@

$(BUILD)/%: $(SRC)/%
	cp -v $< $@

node_modules: package.json
	npm install
	touch node_modules

.PHONY: zip
zip: $(ZIP)

$(ZIP):
	npm install
	NODE_ENV=production make BUILD=$(PROD-BUILD) all
	cd $(PROD-BUILD) && zip -vr ../$(ZIP) .

.PHONY: check
check: lint test

.PHONY: lint
lint: node_modules
	npx eslint .
	npx prettier . --check
	npx tsc --project src --noEmit
	hadolint Dockerfile

.PHONY: fix
fix: node_modules
	npx eslint . --fix
	npx prettier . --write

.PHONY: watch
watch: node_modules
	rm -fr $(BUILD)/**/*.js
	npx --package=chokidar-cli -- chokidar 'Makefile' 'src' '!src/**/*.js' -c 'make' & \
	npx webpack --watch & \
	npx http-server docs -d=false -c=-1 & \
	wait

.PHONY: test
test: node_modules
	npx mocha test/**/*_test.js

.PHONY: clean
clean:
	rm -fr $(BUILD) $(PROD-BUILD) *.zip
