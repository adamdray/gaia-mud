#!/bin/bash

# Script to concatenate project text files into a single output file with headers.

# Define the root directory (current directory)
PROJECT_ROOT="."

# Define directories/files to exclude
# Using -path for directories and -name for files
EXCLUDE_PATHS=(
    -path "./node_modules" -o
    -path "./dist" -o
    -path "./.git" -o
    -name ".env" -o
    -name "project_dump.txt" -o
    -name "concat_project.sh"
)

# Define file patterns to include (adjust as needed)
# FIX: Correctly added -name and -o for json files
INCLUDE_PATTERNS=(
    -name '*.ts' -o
    -name '*.js' -o
    -name 'package.json' -o        # Fixed
    -name 'package-lock.json' -o   # Fixed
    -name 'tsconfig.json' -o       # Fixed
    -name '*.yaml' -o
    -name '*.yml' -o
    -name '*.g' -o
    -name '*.md' -o
    -name '*.html' -o
    -name '*.css'
)

# Construct the find command
# Start with the root path
find_cmd="find \"$PROJECT_ROOT\""
# Add exclusions first, using -prune for directories
find_cmd+=" \( ${EXCLUDE_PATHS[*]} \) -prune"
# Add the include patterns, grouped
find_cmd+=" -o \( ${INCLUDE_PATTERNS[*]} \) -type f -print"

# Execute the find command and process results
eval "$find_cmd" | while IFS= read -r file; do
  # Print a banner header
  echo "// -----------------------------------------------------------------------------"
  # Use sed to remove the leading './' for cleaner relative paths in the header
  relative_path=$(echo "$file" | sed 's|^\./||')
  echo "// File: $relative_path"
  echo "// -----------------------------------------------------------------------------"
  # Print the file content
  cat "$file"
  # Add a newline for separation
  echo
done

echo "// --- End of Concatenated Files ---"

