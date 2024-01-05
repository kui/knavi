SRC = src
BUILD = build
ZIP = knavi-$(shell scripts/version.js).zip
JS = background.js content-root.js content-all.js options.js
STATICS = $(patsubst $(SRC)/%, %, $(wildcard $(SRC)/*.html $(SRC)/*.css))
ICONS = $(addprefix icon, $(addsuffix .png, 16 48 128))
PNG = $(patsubst $(SRC)/%.svg, %.png, $(wildcard $(SRC)/*.svg))
FILES = manifest.json $(STATICS) $(ICONS) $(PNG) $(JS)
ifeq ($(NODE_ENV),production)
	ESBUILD_OPTS = --minify
else
	ESBUILD_OPTS =
endif

.PHONY: all
all: $(BUILD) $(addprefix $(BUILD)/, $(FILES))

$(BUILD):
	mkdir -vp $(BUILD)

$(BUILD)/manifest.json: $(SRC)/manifest.js package.json node_modules
	node scripts/jsonize-manifest.js > $@

$(BUILD)/%.js: $(SRC)/%.ts $(SRC)/lib/* node_modules
	npx esbuild $< $(OPTS) \
		--pure:console.debug --pure:console.log --pure:console.info \
		--pure:console.time --pure:console.timeEnd \
		--tsconfig=./src/tsconfig.esbuild.json \
		--bundle \
		--sourcemap \
		--target=chrome100 \
		--outfile=$@

$(BUILD)/icon%.png: $(SRC)/icon.svg
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
	NODE_ENV=production make clean all
	cd $(BUILD) && zip -vr ../$(ZIP) .

.PHONY: check
check: lint test

.PHONY: lint
lint: node_modules
	npx eslint .
	npx prettier . --check
	npx tsc --project src --noEmit
	hadolint Dockerfile
	./scripts/lint_changelog.bash

.PHONY: fix
fix: node_modules
	npx eslint . --fix
	npx prettier . --write

.PHONY: watch
watch: node_modules
	rm -fr $(BUILD)/**/*.js
	npx --package=chokidar-cli -- chokidar 'Makefile' 'src' -c 'make' & \
	npx http-server docs -d=false -c=-1 & \
	wait

.PHONY: test
test: node_modules
	npx jest test

.PHONY: clean
clean:
	rm -fr $(BUILD) *.zip
