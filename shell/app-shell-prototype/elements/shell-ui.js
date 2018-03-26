// elements
import './suggestion-element.js';
import './settings-panel.js';
// code libs
import Xen from '../../components/xen/xen.js';
import IconStyle from '../../components/icons.css.js';
// strings
import AppIcon from '../icon.svg.js';

// globals
/* global shellPath */

// templates
const html = Xen.html;
const template = html`
  <style>
    ${IconStyle}
    :host {
      --bar-max-width: 400px;
      --bar-max-height: 50vh;
      --bar-hint-height: 112px;
      --bar-small-height: 56px;
      --bar-peek-height: 16px;
      --bar-touch-height: 32px;
      --bar-space-height: 48px;
    }
    :host {
      display: block;
    }
    a {
      color: currentColor;
    }
    [scrim] {
      position: fixed;
      top: 0;
      right: 0;
      /*bottom: 0;*/
      left: 0;
      height: 100vh;
      opacity: 0;
      background-color: white;
      z-index: -1;
      pointer-events: none;
      transition: opacity 200ms ease-in;
    }
    [scrim][open] {
      z-index: 9000;
      pointer-events: auto;
      opacity: 0.8;
    }
    [barSpacer] {
      height: var(--bar-space-height);
    }
    [touchbar] {
      margin-top: calc(var(--bar-touch-height) * -1);
      height: var(--bar-touch-height);
      background-color: transparent;
      /*border: 1px solid rgba(0,0,0,0.01);*/
    }
    [bar] {
      position: fixed;
      z-index: 10000;
      right: 0;
      bottom: 0;
      left: 0;
      box-sizing: border-box;
      max-width: var(--bar-max-width);
      height: var(--bar-max-height);
      transform: translate3d(0, calc(var(--bar-max-height) - var(--bar-peek-height)), 0);
      margin: 0 auto;
      background-color: white;
      box-shadow: 0px 0px 32px 3px rgba(0,0,0,0.13);
      transition: transform 200ms ease-out;
    }
    [bar][state="hint"] {
      transform: translate3d(0, calc(var(--bar-max-height) - var(--bar-hint-height)), 0);
    }
    [bar][state="over"] {
      transform: translate3d(0, calc(var(--bar-max-height) - var(--bar-small-height)), 0);
    }
    [bar][state="open"] {
      transform: translate3d(0, 0, 0);
    }
    [toolbars] {
      display: inline-block;
      white-space: nowrap;
      width: 100%;
      overflow: hidden;
      box-sizing: border-box;
      border-bottom: 1px solid rgba(0,0,0,0.05);
    }
    [toolbar] {
      display: inline-flex;
      align-items: center;
      height: 56px;
      width: 100%;
      transition: transform 100ms ease-in-out;
    }
    [toolbar] > * {
      padding: 12px 16px;
    }
    [main][toolbar]:not([open]) {
      transform: translate3d(-100%, 0, 0);
    }
    [search][toolbar][open] {
      transform: translate3d(-100%, 0, 0);
    }
    [settings][toolbar][open] {
      transform: translate3d(-200%, 0, 0);
    }
    [contents] {
      display: inline-block;
      white-space: nowrap;
      width: 100%;
      overflow: hidden;
      /* consume margin leaking out of suggestion-element */
      margin-top: -6px;
    }
    [content] {
      display: inline-block;
      width: 100%;
      vertical-align: top;
      transition: transform 100ms ease-in-out;
    }
    [suggestions][content]:not([open]) {
      transform: translate3d(-100%, 0, 0);
    }
    [settings][content][open] {
      transform: translate3d(-100%, 0, 0);
    }
    [modal] {
      padding: 32px;
      border: 1px solid orange;
      z-index: 0;
    }
    [modal]:hover {
      position: relative;
      z-index: 0;
    }
    ::slotted([slotid=modal]) {
      position: fixed;
      top: 0;
      bottom: 0;
      max-width: var(--max-width);
      width: 100vw;
      margin: 0 auto;
      padding-bottom: var(--bar-space-width);
      box-sizing: border-box;
      pointer-events: none;
      color: black;
    }
    ::slotted([slotid=suggestions]) {
      display: flex;
      flex-direction: column;
      max-height: 356px;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 6px 10px 10px 10px;
    }
  </style>

  <div scrim open$="{{scrimOpen}}" on-click="_onBarEscape"></div>
  <slot name="modal"></slot>
  <slot></slot>
  <!-- adds space at the bottom of the static flow so no actual content is ever covered by the app-bar -->
  <div barSpacer></div>
  <div bar state$="{{barState}}" open$="{{barOpen}}" over$="{{barOver}}" on-mouseenter="_onBarEnter" on-mouseleave="_onBarLeave">
    <div touchbar on-click="_onTouchbarClick"></div>
    <div toolbars on-click="_onBarClick">
      <div main toolbar open$="{{mainToolbarOpen}}">
        <a href="{{launcherHref}}" title="Go to Launcher">${AppIcon}</a>
        <span style="flex: 1;"></span>
        <icon on-click="_onSearchClick">search</icon>
        <icon on-click="_onSettingsClick">settings</icon>
      </div>
      <div search toolbar open$="{{searchToolbarOpen}}">
        <icon on-click="_onMainClick">arrow_back</icon>
        <span style="flex: 1;"></span>
        <icon>search</icon>
      </div>
      <div settings toolbar open$="{{settingsToolbarOpen}}">
        <icon on-click="_onMainClick">arrow_back</icon>
        <span style="flex: 1;"></span>
        <icon>settings</icon>
      </div>
    </div>
    <div contents>
      <div suggestions content open$="{{suggestionsContentOpen}}">
        <slot name="suggestions" slot="suggestions" on-plan-choose="_onPlanChoose"></slot>
      </div>
      <settings-panel settings content open$="{{settingsContentOpen}}"></settings-panel>
    </div>
  </div>
`;

const log = Xen.logFactory('ShellUi', '#ac6066');

class ShellUi extends Xen.Debug(Xen.Base, log) {
  static get observedAttributes() { return ['showhint']; }
  get template() {
    return template;
  }
  _getInitialState() {
    return {
      barState: 'peek',
      toolState: 'main',
      // TODO(sjmiles): include manifest or other directives?
      launcherHref: `${location.origin}${location.pathname}`
    };
  }
  _update({}, {}, oldProps, oldState) {
  }
  _render({}, state) {
    const {toolState} = state;
    const mainOpen = toolState === 'main';
    const searchOpen = toolState === 'search';
    const settingsOpen = toolState === 'settings';
    const renderModel = {
      scrimOpen: state.barState === 'open',
      mainToolbarOpen: mainOpen,
      searchToolbarOpen: searchOpen,
      suggestionsContentOpen: mainOpen || searchOpen,
      settingsToolbarOpen: settingsOpen,
      settingsContentOpen: settingsOpen,
    };
    return [state, renderModel];
  }
  _onBarEscape() {
    this._setState({barState: 'peek'});
  }
  _onTouchbarClick() {
    if (this._state.barState !== 'over') {
      this._setState({barState: 'open'});
    }
  }
  _onBarClick() {
    this._setState({barState: this._state.barState === 'open' ? 'peek' : 'open'});
  }
  _onBarEnter(e) {
    if ((e.target === e.currentTarget) && (this._state.barState === 'peek')) {
      this._setState({barState: this._props.showhint ? 'hint' : 'over'});
    }
  }
  _onBarLeave(e) {
    if ((e.target === e.currentTarget) && (window.innerHeight - e.clientY) > 8) {
      switch (this._state.barState) {
        case 'over':
        case 'hint':
          this._setState({barState: 'peek'});
          break;
      }
    }
  }
  _onSearchClick(e) {
    e.stopPropagation();
    this._setState({toolState: 'search', barState: 'open'});
  }
  _onMainClick(e) {
    e.stopPropagation();
    this._setState({toolState: 'main', barState: 'open'});
  }
  _onSettingsClick(e) {
    e.stopPropagation();
    this._setState({toolState: 'settings', barState: 'open'});
  }
  _onPlanChoose(e, plan) {
    e.stopPropagation();
    this._fire('plan', plan);
    this._setState({barState: 'peek'});
  }
}

customElements.define('shell-ui', ShellUi);