# vhs demo for README.md
# Render with:  vhs docs/demo.tape

Output docs/demo.gif

Set FontSize 14
Set Width 1100
Set Height 600
Set Theme "Catppuccin Mocha"
Set Padding 18
Set TypingSpeed 18ms
Set PlaybackSpeed 0.85

# Real binary, real repo (this project itself).
Hide
Type "cd /Volumes/Projects/mincut-context"
Enter
Type "clear"
Enter
Show

# 1. Cold keyword pack — small budget, structurally cohesive output.
Type "mcx pack 'personalized pagerank algorithm' --budget 1500 --exclude tests/** dist/** node_modules/**"
Sleep 600ms
Enter
Sleep 4s

Type "clear"
Enter
Sleep 300ms

# 2. Show the JSON shape an agent would see.
Type "mcx pack 'min cut selection' --budget 1500 --exclude tests/** dist/** node_modules/** --format json | head -25"
Sleep 600ms
Enter
Sleep 5s

Type "clear"
Enter
Sleep 300ms

# 3. Semantic search — bridges the lexical gap.
Type "# 'centrality' never appears in any symbol name in the repo"
Enter
Sleep 800ms
Type "mcx pack 'graph centrality and ranking' --budget 1500 --embed --embed-weight 0.8 --exclude tests/** dist/** node_modules/**"
Sleep 600ms
Enter
Sleep 7s

Sleep 1.5s
