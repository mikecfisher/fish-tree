ft() {
    # TUI commands need direct terminal access — use a temp file for the result
    if [ $# -eq 0 ] || [ "$1" = "ui" ]; then
        local tmpfile
        tmpfile=$(mktemp /tmp/ft-result.XXXXXX)
        FT_RESULT_FILE="$tmpfile" command fish-tree "$@"
        local cmd_status=$?
        if [ -s "$tmpfile" ]; then
            local result
            result=$(cat "$tmpfile")
            if [ -d "$result" ]; then
                cd "$result"
            fi
        fi
        rm -f "$tmpfile"
        return $cmd_status
    fi

    # CLI commands: capture stdout so we can cd if it's a directory path
    local output
    output=$(command fish-tree "$@")
    local cmd_status=$?
    if [ $cmd_status -eq 0 ] && [ -n "$output" ] && [ -d "$output" ]; then
        cd "$output"
    elif [ -n "$output" ]; then
        echo "$output"
    fi
    return $cmd_status
}
