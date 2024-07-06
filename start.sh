#!/bin/bash

# Start the first server
yarn run dev &

# Start the second server
cd game-server && yarn run dev &

# Wait for all background processes to finish
wait