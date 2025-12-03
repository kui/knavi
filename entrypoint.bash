#!/bin/bash -i
source $NVM_DIR/nvm.sh
nvm use
make "$@"
