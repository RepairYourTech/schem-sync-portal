import sys
import os

def analyze_file(filepath):
    if not os.path.exists(filepath):
        print(f"Error: File {filepath} not found.")
        return

    total_lines = 0
    comment_lines = 0
    
    # Simple heuristic for comments based on extension
    # Extend this for other languages as needed
    comment_markers = ['//', '#']
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            total_lines = len(lines)
            for line in lines:
                stripped = line.strip()
                for marker in comment_markers:
                    if stripped.startswith(marker):
                        comment_lines += 1
                        break
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    if total_lines == 0:
        ratio = 0
    else:
        ratio = (comment_lines / total_lines) * 100

    print(f"File: {os.path.basename(filepath)}")
    print(f"Total Lines: {total_lines}")
    print(f"Comment Lines: {comment_lines}")
    print(f"Comment Density: {ratio:.2f}%")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python comment_density.py <filepath>")
        sys.exit(1)
    
    analyze_file(sys.argv[1])
