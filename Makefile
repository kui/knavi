SRC = src
BUILD = build
JS = $(addprefix $(BUILD)/,content-script.js options.js background.js)
SRC_STATICS = $(wildcard $(SRC)/*.html $(SRC)/*.css)
STATICS = $(SRC_STATICS:$(SRC)/%=$(BUILD)/%)
ICONS = $(addprefix $(BUILD)/icon, $(addsuffix .png/, 16 48 128))
BIN = node_modules/.bin

.PHONY: all
all: debug-build

.PHONY: debug-build
debug-build: $(BUILD) $(BUILD)/manifest.json $(STATICS) $(ICONS) $(JS)

$(BUILD):
	mkdir -v $(BUILD)

$(BUILD)/manifest.json: $(SRC)/manifest.js
	$(BIN)/babel-node scripts/jsonize-manifest.js > $@

$(BUILD)/%.js: $(SRC)/%.js
	$(BIN)/webpack

$(ICONS): $(SRC)/icon.svg
	convert -verbose src/icon.svg \
		-resize `echo $@ | sed -nre 's/.*icon([0-9]+)\.png/\1/p'`x \
		$@

$(BUILD)/%: $(SRC)/%
	cp -v $< $@

node_modules:
	npm install

.PHONY: prod-build
prod-build: clean $(BUILD) $(BUILD)/manifest.json $(STATICS) $(ICONS)
	NODE_ENV=production $(BIN)/webpack

.PHONE: check
check: flow eslint

.PHONY: flow
flow:
	$(BIN)/flow src

.PHONY: eslint
lint:
	$(BIN)/eslint src

.PHONY: watch
watch:
	$(BIN)/watch make src

.PHONY: clean
clean:
	rm -fr $(BUILD)
