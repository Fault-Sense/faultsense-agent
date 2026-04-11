<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Faultsense Livewire harness</title>

    {{--
      Load order: the conformance collector must register on
      window.Faultsense.collectors.conformance BEFORE the agent
      resolves data-collector-url, and both must run BEFORE Livewire's
      Alpine runtime boots so the agent's init-time scan sees the
      server-rendered DOM with its fs-* attributes intact.
    --}}
    <script src="/collector.js"></script>
    <script
        id="fs-agent"
        src="/faultsense-agent.min.js"
        data-release-label="livewire-harness"
        data-api-key="test"
        data-collector-url="conformance"
        data-gc-interval="5000"></script>

    {{-- @livewireStyles is a no-op in Livewire 3 (no CSS to inject)
         but kept for symmetry with documented Livewire layouts. --}}
    @livewireStyles
</head>
<body>
    <livewire:todos-component />

    {{-- @livewireScripts loads the Livewire runtime including its
         Alpine-based morph patcher, which is what we're validating in
         the morph/status-flip scenario. --}}
    @livewireScripts
</body>
</html>
