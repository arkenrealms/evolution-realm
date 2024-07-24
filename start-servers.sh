#!/bin/bash

# Start the first server
rushx dev &

# Start the second server
cd game-server && rushx dev &

# Wait for all background processes to finish
wait