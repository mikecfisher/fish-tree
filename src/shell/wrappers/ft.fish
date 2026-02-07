function ft --description "fish-tree: git worktree manager"
    # TUI commands need direct terminal access — use a temp file for the result
    if test (count $argv) -eq 0; or test "$argv[1]" = "ui"
        set -l tmpfile (mktemp /tmp/ft-result.XXXXXX)
        FT_RESULT_FILE=$tmpfile command fish-tree $argv
        set -l cmd_status $status
        if test -s "$tmpfile"
            set -l result (cat "$tmpfile")
            if test -d "$result"
                cd "$result"
            end
        end
        rm -f "$tmpfile"
        return $cmd_status
    end

    # CLI commands: capture stdout so we can cd if it's a directory path
    set -l output (command fish-tree $argv | string collect)
    set -l cmd_status $pipestatus[1]
    if test $cmd_status -eq 0 -a -n "$output" -a -d "$output"
        cd "$output"
    else if test -n "$output"
        echo "$output"
    end
    return $cmd_status
end
