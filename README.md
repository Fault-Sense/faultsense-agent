<div align="center">
  <img src="https://raw.githubusercontent.com/Fault-Sense/faultsense-agent/main/assets/logo.svg" alt="Faultsense Logo" width="600">
</div>

## Summary

**A Framework & Language Agnostic Application Feature Monitor for the Frontend**

Fault Sense monitors the health of features in a web application by using real-time assertions to validate expectations of user behavior. When key metrics are down, you can quickly and accurately determine if a feature is broken for a subset of users.

## How it Works

Fault Sense is a small (6.5 KB gzipped) JS agent and HTML attribute API you use to validate the expected behavior of a feature in your web app.

You can create and resolve assertions by annotating your HTML with special Fault Sense attributes. You'll use a combination of triggers, types and modifiers to validate functionality within your application and use keys (and optional labels) to categorize them for reporting in your event collection backend. A console collector has been provided to make it easy to try out Fault Sense locally.

The Fault Sense Agent quietly monitors real-world deviations from the expected behavior and generates pass/fail events that can be collected and aggregated to display a breakdown of users who had flawless experiences and those who had faults sensed with the feature or overall release.

Fault Sense works with any language or framework that can render HTML.

You can bring your own backend or use any event collection backend. A managed/hosted option for event collection will be offered to support this project.

An Application ~~Performance~~ Feature Monitor for the Frontend.


## Quick Start

### Installation
The simplest way to get started and try out Fault Sense is to add the following script tag in your root template:

```html
<script
  defer
  id="fs-agent"
  src="https://unpkg.com/faultsense@latest/dist/faultsense-agent.min.js"
  data-release-label="0.0.0"
  data-collector-url="console"
  data-debug="true"
/>
```

If you need more control over how Fault Sense is initialized, you can manually initialize the agent. Make sure init() is called after DOMContentLoaded has fired.

```html
<script src="https://unpkg.com/faultsense@latest/dist/faultsense-agent.min.js"></script>
<script>
document.addEventListener('DOMContentLoaded', () => {
  const cleanup = Faultsense.init({
    releaseLabel: '0.0.0', // your application's release identifier
    collectorURL: Faultsense.collectors.consoleCollector, // Logs to console
    debug: true
  });
});
</script>
```

In production, set debug to false and set the collectorURL to an event collection endpoint you own. See [Configuration](#configuration) for more info. 

### Basic Examples

```html
<!-- button should modify the contents of a div, matching a regex -->
<div id="counter">Count: 0</div>
<button 
  onclick="..."
  x-test-feature-key="counter"
  x-test-assertion-key="increment-btn"
  x-test-trigger="click"
  x-test-assert-updated="#counter"
  x-test-text-matches="Count: \d+">
  Increment
</button>
```

```html
<!--
 When the TODO is submitted:
  * assert the new item is created with the specific text, within 400ms
    - you can update the text-matches attr with user input for dynamic validation
  * assert that the API returned a 201 response
    - Network request or response needs the x-resp-for="add-todo" header or param
-->
<ul id="todos"></ul>
<form 
  onsubmit="..."
  x-test-feature-key="todo-management"
  x-test-assertion-key="add-todo"
  x-test-trigger="submit"
  x-test-assert-added="#todos li"
  x-test-assert-response-status="201"
  >

  <input type="text" placeholder="New todo...">
  <button type="submit">Add Todo</button>
</form>
```


## Configuration

#### **Required**

`releaseLabel` | `data-release-label` - Your application's release identifier as a string. This allows you to monitor the health of features across releases.

`collectorURL` | `data-collector-url` - The collection API endpoint to send events. If a URL, `apiKey` is also required. Collector URL can be set to a function. A function gives you full control over how events are sent to your backend. `Faultsense.collectors.consoleCollector` is provided that will write events to the console for testing or development.

#### **Optional**

`timeout` | `data-timeout` - The maximum amount of time in milliseconds to wait for an assertion to resolve before failing it. This is the global default but can be overridden at an individual assertion. Default: 1_000ms.

`debug` | `data-debug` - Enable or disable console logging by the library (excluding `Faultsense.collectors.consoleCollector`). Default: false.

`apiKey` | `data-api-key` - API Key for the event collection endpoint. Only required if collectorURL is a URL.


## Creating Assertions

You can create (and resolve) assertions by annotating your HTML with Fault Sense attributes. You'll use a combination of triggers, types and modifiers to validate functionality within your application and use keys (and optional labels) to categorize them for reporting in your event collection backend.

### Triggers

Triggers are the implicit or explicit actions that create assertions. You must have 1 and only 1 trigger on a single HTML element.

Triggers follow the form of `x-test-trigger=<trigger>`. The following triggers are supported:

`mount` - when the HTML element is added to the DOM

`unmount` - when the HTML element is removed from the DOM

`load` - when an element's resource (img,video) completes loading or errors

`click` - when the element is clicked

`change` - when an input element's value changes

`blur` - when an input element loses focus

`submit` - used on a form element when it is submitted

We can add support for more events from the [Event Reference](https://developer.mozilla.org/en-US/docs/Web/Events)

### Assertion Types

Once an action is taken and an assertion is triggered, Types specify how to resolve the assertion. At least 1 Assertion Type is required. You may have multiple types on a single HTML element. Adding multiple types will create multiple independent Assertions waiting to be resolved.

#### DOM Assertion Types

DOM assertion types follow the form of `x-test-assert-<type>=<selector>`. Assertions will be resolved when an element matching the selector passes the rule enforced by Type.

The following Types are supported:

`added=<selector>` - The element was found in the DOM.

`removed=<selector>` - The element was not found in the DOM.

`updated=<selector>` - The element was found and was updated after the Assertion was triggered.

`visible=<selector>` - The element exists in the DOM and is visible.

`hidden=<selector>` - The element exists in the DOM and is hidden. The Assertion will fail if the element does not exist in the DOM.

`loaded=<selector>` - A load or error event was triggered on this element. load events will cause the assertion to pass, where error will cause it to fail.


####  Assertion Type Modifiers

Modifiers are optional, but allow you to customize aspects of how Fault Sense resolves the assertion. Modifiers follow the form `x-test-<modifier>=<value>`. If your element has multiple assertion types, modifiers will be attached to all of the assertion types.

`mpa-mode="true"` - If you have an action that you want to resolve on the next page load, enabling mpa-mode for the assertion will store the assertion in localStorage and attempt to resolve it when the next page has completed loading (assuming Fault Sense is initialized on the next page).

`timeout=<ms>` - Overrides the timeout used before failing the assertion. By default it will use the global timeout specified in the Fault Sense configuration.

#### DOM Assertion Type Modifiers 

`classlist=<value>` - `value` is a JSON object of className: boolean where boolean determines if the class should exist in the target's classlist.

`attrs-match=<value>` - `value` is a JSON object of attribute name/value pairs that must match the target element (selector) provided by another Type above.

`text-matches=<string|regex>` - the text node of the target element used in a DOM assertion must match value (either string literal or regular expression)


#### Network Assertion Types

Network assertion types allow you to create assertions for fetch/xhr calls that resolve when the network response arrives. All network assertions follow the form of `x-test-assert-<type>=<value>`, where `<type>=<value>` are noted below.

`response-status=<status>` - The HTTP response has this status

```html
<!-- Assert that the HTTP response status from the form submission is HTTP 200 -->
<form ... x-test-assert-response-status="200"></form>
```

`response-headers=<headerJSON>` - A Subset of HTTP response headers match headerJSON

```html
<!-- Assert that the HTTP response headers from the form submission contain: -->
<form
  ...
  x-test-assert-response-headers='{ "content-type": "application/json" }'
></form>
```

#### Associating Network Assertions

In order to use network assertions, the network request must contain the assertion key. This enables Fault Sense to resolve the correct Assertion when the HTTP response (or error) is handled. See [Identifying Assertions](#identifying-assertions) for more information on Assertion keys. You can do this multiple ways (pick one):

1. The HTTP response contains a `x-resp-for=<assertion-key>` header
2. The HTTP request contains a `x-resp-for=<assertion-key>` header
3. The HTTP request contains the query parameter `?x-resp-for=<assertion-key>`


### Identifying Assertions

Assertions are categorized by release (provided in the config) and then by feature. Every assertion can have a key and label to identify the assertion and feature it is a part of, but only key is required. Key must remain consistent across releases but label may change over time. Identifiers follow the form `x-test-<identifier>=<value>`

`assertion-key=<value>` - Required. The unique ID for this assertion. This value will also be used to associate network responses with assertions (see [Network Assertion Types](#associating-network-assertions)).

`feature-key=<value>` - Required. Used to group assertions under a feature umbrella. Multiple unique assertions can have the same feature-key value.

`assertion-label=<value>` - Optional. A more human readable description of the assertion. May change over time and can be set in the Fault Sense dashboard if omitted in code.

`feature-label=<value>` - Optional. A more human readable description of the feature. May change over time, but if multiple, different values exist for the same feature key, the last one received in an event wins. This can be set in the Fault Sense dashboard if omitted in code.

### Resolving Assertions

Assertions are only resolved once per page load unless the status of the assertion changes. For example, if you are testing that a button click opens a panel and it passes, you will only receive one event for this assertion (for this user) unless a subsequent action causes it to fail. Then you will receive another event. 

Your event collection backend is responsible for attaching user agent information so you can aggregate pass/fails for a feature in a release and across users (device, OS, browser).

## Event Collection Payload
The `collectorURL` will receive `EventPayload` in the body of a HTTP POST if collectorURL is a URL or as the first argument to the collector function.

```ts
type AssertionStatus = "passed" | "failed";

type AssertionType =
  | "added"
  | "removed"
  | "updated"
  | "visible"
  | "hidden"
  | "loaded"
  | "response-headers"
  | "response-status";

type AssertionModifier =
  | "mpa-mode"
  | "timeout"
  | "text-matches"
  | "attrs-match"
  | "classlist";

type AssertionModifierValue = string;

type AssertionTrigger = 
  | "mount"
  | "unmount"
  | "click"
  | "dblclick"
  | "change"
  | "blur"
  | "submit"
  | "load"
  | "error"

interface EventPayload {
  assertion_key: string;
  assertion_label: string;
  assertion_trigger: AssertionTrigger;
  assertion_type_value: string;
  assertion_type: AssertionType;
  assertion_type_modifiers: Record<AssertionModifier, AssertionModifierValue>;
  element_snapshot: string;
  feature_key: string;
  feature_label: string;
  release_label: string;
  status_reason: string;
  status: AssertionStatus;
  timestamp: string;
}
```


## Package Info

- **Size**: 6.5 KB gzipped
- **Dependencies**: None
- **Browser Support**: Modern browsers (ES2020+)
- **Framework**: Works with any Backend or Frontend framework that renders HTML

## Links
- 🐛 [Issues](https://github.com/Fault-Sense/faultsense-agent/issues)
- 💬 [Discussions](https://github.com/Fault-Sense/faultsense-agent/discussions)
