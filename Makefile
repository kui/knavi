SRC = src
BUILD ?= build
PROD-BUILD = prod-build
ZIP = knavi.zip
JS = $(patsubst $(SRC)/%, $(BUILD)/%, $(filter-out $(SRC)/manifest.js, $(wildcard $(SRC)/*.js)))
STATICS = $(patsubst $(SRC)/%, $(BUILD)/%, $(wildcard $(SRC)/*.html $(SRC)/*.css))
ICONS = $(addprefix $(BUILD)/icon, $(addsuffix .png, 16 48 128))
PNG = $(patsubst $(SRC)/%.svg, $(BUILD)/%.png, $(wildcard $(SRC)/*.svg))
BIN = node_modules/.bin

FILES = $(BUILD) $(BUILD)/manifest.json $(BUILD)/codemirror.css $(STATICS) $(ICONS) $(PNG)

.PHONY: all
all: debug-build

.PHONY: debug-build
debug-build: lint $(FILES) $(JS)

$(BUILD):
	mkdir -v $(BUILD)

$(BUILD)/manifest.json: $(SRC)/manifest.js package.json node_modules
	$(BIN)/babel-node scripts/jsonize-manifest.js > $@

$(BUILD)/%.js: $(SRC)/%.js $(SRC)/lib/*.js node_modules
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
	npm install
	touch node_modules

.PHONY: zip
zip: $(ZIP)

$(ZIP):
	NODE_ENV=production make BUILD=$(PROD-BUILD) test
	NODE_ENV=production make BUILD=$(PROD-BUILD) $(patsubst $(BUILD)/%.js,$(PROD-BUILD)/%.js,$(firstword $(JS)))
	NODE_ENV=production make BUILD=$(PROD-BUILD) node_modules $(FILES) $(JS)
	zip -r $(ZIP) $(PROD-BUILD)

.PHONY: test
test: lint mocha

.PHONY: lint
lint: node_modules
	$(BIN)/eslint .

.PHONY: fix
fix: node_modules
	$(BIN)/eslint . --fix

.PHONY: watch
watch: node_modules
	rm -fr $(BUILD)/**/*.js
	$(BIN)/chokidar 'Makefile' 'src' '!src/**/*.js' -c 'make' & \
	$(BIN)/webpack --watch & \
	wait

.PHONY: mocha
mocha: node_modules
	$(BIN)/mocha --require '@babel/register' test/**/*_test.js

.PHONY: clean
clean:
	rm -fr $(BUILD) $(PROD-BUILD) *.zip
