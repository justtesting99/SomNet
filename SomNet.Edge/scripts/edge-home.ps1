# SomNet Edge install root — default D:\SomNet.Edge (override: set SOMNET_EDGE_HOME)
# Dot-source from other scripts: . "$PSScriptRoot\edge-home.ps1"

function Get-SomNetEdgeHome {
    if ($env:SOMNET_EDGE_HOME) {
        return $env:SOMNET_EDGE_HOME
    }
    return 'D:\SomNet.Edge'
}

function Get-SomNetEdgePaths {
    $base = Get-SomNetEdgeHome
    [PSCustomObject]@{
        Base   = $base
        Bin    = Join-Path $base 'bin'
        Config = Join-Path $base 'go2rtc.yaml'
        Logs   = Join-Path $base 'logs'
    }
}
