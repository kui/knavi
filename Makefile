SRC = src
BUILD ?= build
PROD-BUILD = prod-build
ZIP = knavi.zip
JS = $(patsubst $(SRC)/%, $(BUILD)/%, $(filter-out $(SRC)/manifest.js, $(wildcard $(SRC)/*.js)))
STATICS = $(patsubst $(SRC)/%, $(BUILD)/%, $(wildcard $(SRC)/*.html $(SRC)/*.css))
ICONS = $(addprefix $(BUILD)/icon, $(addsuffix .png/, 16 48 128))
PNG = $(patsubst $(SRC)/%.svg, $(BUILD)/%.png, $(wildcard $(SRC)/*.svg))
BIN = node_modules/.bin

FILES = $(BUILD) $(BUILD)/manifest.json $(BUILD)/codemirror.css $(STATICS) $(ICONS) $(PNG)

.PHONY: all
all: debug-build

.PHONY: debug-build
debug-build: node_modules $(FILES) $(JS) check

$(BUILD):
	mkdir -v $(BUILD)

$(BUILD)/manifest.json: $(SRC)/manifest.js package.json
	$(BIN)/babel-node scripts/jsonize-manifest.js > $@

$(BUILD)/%.js: $(SRC)/%.js $(SRC)/lib/*.js
	@echo execute webpack for $@
	DEST=$(BUILD) $(BIN)/webpack

$(ICONS): $(SRC)/icon.svg
	convert -verbose src/icon.svg \
		-resize `echo $@ | sed -nre 's/.*icon([0-9]+)\.png/\1/p'`x \
		$@

$(BUILD)/%.png: $(SRC)/%.svg
	convert -verbose $< -resize 40x $@

$(BUILD)/codemirror.css: node_modules
	cp -v node_modules/codemirror/lib/codemirror.css $@

$(BUILD)/%: $(SRC)/%
	cp -v $< $@

node_modules: package.json
	yarn install

.PHONY: zip
zip: $(ZIP)

$(ZIP):
	NODE_ENV=production make BUILD=$(PROD-BUILD) test
	NODE_ENV=production make BUILD=$(PROD-BUILD) $(patsubst $(BUILD)/%.js,$(PROD-BUILD)/%.js,$(firstword $(JS)))
	NODE_ENV=production make BUILD=$(PROD-BUILD) all
	zip -r $(ZIP) $(PROD-BUILD)

.PHONY: test
test: check mocha

.PHONY: check
check: flow lint

.PHONY: flow
flow:
# Detect no "@flow" files
	@for f in src/**/*.js src/*.js; \
		do ( head -n1 "$$f" | grep -qF '@flow' ) || printf "\e[38;5;1mWARN: No @flow: $$f\n\e[0m"; \
	done
	$(BIN)/flow src

.PHONY: lint
lint:
	$(BIN)/eslint src

.PHONY: watch
watch:
	rm -fr $(BUILD)/**/*.js
	$(BIN)/chokidar 'Makefile' 'src' '!src/**/*.js' -c 'make' & \
	$(BIN)/chokidar 'src/**/*.js' -c 'make flow' & \
	$(BIN)/webpack --watch & \
	wait

.PHONY: mocha
mocha:
	$(BIN)/mocha --compilers 'js:babel-register' test/**/*_test.js

.PHONY: clean
clean:
	rm -fr $(BUILD) $(PROD-BUILD) *.zip
