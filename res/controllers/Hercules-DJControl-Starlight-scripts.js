var DJCStarlight = {};
///////////////////////////////////////////////////////////////
//                       USER OPTIONS                        //
///////////////////////////////////////////////////////////////

// How fast scratching is.
DJCStarlight.scratchScale = 1.0;

// How much faster seeking (shift+scratch) is than scratching.
DJCStarlight.scratchShiftMultiplier = 4;

// How fast bending is.
DJCStarlight.bendScale = 1.0;

// How long after holding Bass / Filter button to maximize the library
DJCStarlight.libraryMaximizeDelay = 200;

// How fast to scroll through the library
DJCStarlight.libraryScrollSpeed = 10;

// DJControl_Starlight_scripts.js
//
// ****************************************************************************
// * Mixxx mapping script file for the Hercules DJControl Starlight.
// * Author: DJ Phatso and Kerrick Staley
// * Version 1.3 (March 21 2019)
// * Forum: https://mixxx.org/forums/viewtopic.php?f=7&t=12570
// * Wiki: https://mixxx.org/wiki/doku.php/hercules_dj_control_starlight
// Changes to v1.3
// - Fix seek-to-start and cue-master behavior.
// - Change loops to 1/2/4/8 beats.
// - Tweak scratch, seek, and bend behavior.
// - Refactor to reduce code size.
// Changes to v1.2
// - Controller knob/slider values are queried on startup, so MIXXX is synced.
// - Fixed vinyl button behavior the first time it's pressed.
// Changes to v1.1
// - Vinyl button now enables/disables scratch function (On by default);
// - FX: SHIFT + Pad = Effect Select
//
// v1.0 : Original release

// TODO: Functions that could be implemented to the script:
// * Tweak/map base LED to other functions (if possible).
// * FX:
//   - Potentially pre-select/load effects into deck and set parameters
// * Fix behavior when adjusting tempo slider after pressing [Sync] (tempo
//   adjustment should be relative, not absolute).
// ****************************************************************************

// We have to disable the no-unused-vars check because we have many MIDI
// callbacks that receive a fixed list of arguments, but we usually don't use
// most of these arguments. Eslint seems to make it relatively difficult to
// disable this check on a case-by-case basis, so we disable it for the whole
// file.
// See this GitHub issue for more context:
// https://github.com/eslint/eslint/issues/1939
/*eslint-disable no-unused-vars*/

// -------- Constants -------------------------------
DJCStarlight.kScratchActionNone = 0;
DJCStarlight.kScratchActionScratch = 1;
DJCStarlight.kScratchActionSeek = 2;
DJCStarlight.kScratchActionBend = 3;

// -------- Functions -------------------------------

// The base LED are mapped to the VU Meter for light show.
DJCStarlight.baseLEDUpdate = function(value, group, control){
    value = (value*127);
    switch(control) {
    case "VuMeterL":
        midi.sendShortMsg(0x91, 0x23, value);
        break;

    case "VuMeterR":
        midi.sendShortMsg(0x92, 0x23, value);
        break;
    }
};


DJCStarlight.init = function() {
    // Whether the Bass / Filter button is currently held
    DJCStarlight.bassShifted = false;
    DJCStarlight.scratchButtonState = true;
    DJCStarlight.scratchAction = {
        1: DJCStarlight.kScratchActionNone,
        2: DJCStarlight.kScratchActionNone};
    // Used to assist in library scrolling speed
    DJCStarlight.wheelScrollState = [0, 0];

    // Turn off base LED default behavior
    midi.sendShortMsg(0x90,0x24,0x00);

    // Vinyl button LED On.
    midi.sendShortMsg(0x91, 0x03, 0x7F);

    // Connect the base LEDs
    engine.connectControl("[Channel1]","VuMeterL","DJCStarlight.baseLEDUpdate");
    engine.connectControl("[Channel2]","VuMeterR","DJCStarlight.baseLEDUpdate");

    // Set effects Levels - Dry/Wet
    engine.setParameter("[EffectRack1_EffectUnit1_Effect1]", "meta", 0.6);
    engine.setParameter("[EffectRack1_EffectUnit1_Effect2]", "meta", 0.6);
    engine.setParameter("[EffectRack1_EffectUnit1_Effect3]", "meta", 0.6);
    engine.setParameter("[EffectRack1_EffectUnit2_Effect1]", "meta", 0.6);
    engine.setParameter("[EffectRack1_EffectUnit2_Effect2]", "meta", 0.6);
    engine.setParameter("[EffectRack1_EffectUnit2_Effect3]", "meta", 0.6);
    engine.setParameter("[EffectRack1_EffectUnit1]", "mix", 1);
    engine.setParameter("[EffectRack1_EffectUnit2]", "mix", 1);

    // Ask the controller to send all current knob/slider values over MIDI, which will update
    // the corresponding GUI controls in MIXXX.
    midi.sendShortMsg(0xB0, 0x7F, 0x7F);
};


// The Vinyl button, used to enable or disable scratching on the jog wheels (The Vinyl button enables both deck).
DJCStarlight.vinylButton = function(channel, control, value, status, group) {
    if (value) {
        if (DJCStarlight.scratchButtonState) {
            DJCStarlight.scratchButtonState = false;
            midi.sendShortMsg(0x91,0x03,0x00);

        } else {
            DJCStarlight.scratchButtonState = true;
            midi.sendShortMsg(0x91,0x03,0x7F);
        }
    }
};


DJCStarlight._scratchEnable = function(deck) {
    var alpha = 1.0/8;
    var beta = alpha/32;
    engine.scratchEnable(deck, 248, 33 + 1/3, alpha, beta);
};


DJCStarlight._convertWheelRotation = function(value) {
    // When you rotate the jogwheel, the controller always sends either 0x1
    // (clockwise) or 0x7F (counter clockwise). 0x1 should map to 1, 0x7F
    // should map to -1 (IOW it's 7-bit signed).
    return value < 0x40 ? 1 : -1;
}

DJCStarlight.wheelTap = function(deck) {
    if (DJCStarlight.bassShifted){
        if (deck === 1){
            // Expand / collapse library sidebar
            engine.setValue("[Playlist]", "ToggleSelectedSidebarItem", true);
        }
        if (deck === 2){
            // Load track
            for (var track = 1; track <= 2; track++){
                if (!engine.getValue("[Channel" + track + "]", "play")){
                    engine.setValue("[Channel" + track + "]", "LoadSelectedTrack", true);
                    break;
                    }
                }
        }
    }
}

// The touch action on the jog wheel's top surface
DJCStarlight.wheelTouch = function(channel, control, value, status, group) {
    var deck = channel;
    if (value > 0) {
        //  Touching the wheel.
        DJCStarlight.wheelTouchTime = new Date();
        if (engine.getValue("[Channel" + deck + "]", "play") !== 1 || DJCStarlight.scratchButtonState) {
            DJCStarlight._scratchEnable(deck);
            DJCStarlight.scratchAction[deck] = DJCStarlight.kScratchActionScratch;
        } else {
            DJCStarlight.scratchAction[deck] = DJCStarlight.kScratchActionBend;
        }
    } else {
        // Released the wheel.
        delta = (new Date()) - DJCStarlight.wheelTouchTime;
        if (delta < 200) {
            // A quick tap on the wheel
            DJCStarlight.wheelTap(deck);
            }

        engine.scratchDisable(deck);
        DJCStarlight.scratchAction[deck] = DJCStarlight.kScratchActionNone;
    }
};


// The touch action on the jog wheel's top surface while holding shift
DJCStarlight.wheelTouchShift = function(channel, control, value, status, group) {
    var deck = channel - 3;
    // We always enable scratching regardless of button state.
    if (value > 0) {
        DJCStarlight._scratchEnable(deck);
        DJCStarlight.scratchAction[deck] = DJCStarlight.kScratchActionSeek;
    } else {
        // Released the wheel.
        engine.scratchDisable(deck);
        DJCStarlight.scratchAction[deck] = DJCStarlight.kScratchActionNone;
    }
};


// Scratching on the jog wheel (rotating it while pressing the top surface)
DJCStarlight._scratchWheelImpl = function(deck, value) {
    var interval = DJCStarlight._convertWheelRotation(value);
    var scratchAction = DJCStarlight.scratchAction[deck];

    if (scratchAction == DJCStarlight.kScratchActionScratch) {
        engine.scratchTick(deck, interval * DJCStarlight.scratchScale);
    } else if (scratchAction == DJCStarlight.kScratchActionSeek) {
        engine.scratchTick(deck,
                           interval
                           * DJCStarlight.scratchScale
                           * DJCStarlight.scratchShiftMultiplier);
    } else {
        DJCStarlight._bendWheelImpl(deck, value);
    }
};


// Browsing the library with the jog wheels
DJCStarlight._libraryBrowse = function(deck, value) {
    var interval = DJCStarlight._convertWheelRotation(value) / 100 * DJCStarlight.libraryScrollSpeed;
    DJCStarlight.wheelScrollState[deck-1] += interval;
    var step = Math.floor(DJCStarlight.wheelScrollState[deck-1]);
    DJCStarlight.wheelScrollState[deck-1] -= step;
    if (deck === 1){
        engine.setValue("[Playlist]", "SelectPlaylist", step);
    }
    if (deck === 2){
        engine.setValue("[Playlist]", "SelectTrackKnob", step);
    }
}

// Scratching on the jog wheel (rotating it while pressing the top surface)
DJCStarlight.scratchWheel = function(channel, control, value, status, group) {
    var deck = channel;
    if (!DJCStarlight.bassShifted){
        DJCStarlight._scratchWheelImpl(deck, value);
    } else {
        DJCStarlight._libraryBrowse(deck, value);
    }
};


// Seeking on the jog wheel (rotating it while pressing the top surface and holding Shift)
DJCStarlight.scratchWheelShift = function(channel, control, value, status, group) {
    var deck = channel - 3;
    DJCStarlight._scratchWheelImpl(deck, value);
};


DJCStarlight._bendWheelImpl = function(deck, value) {
    var interval = DJCStarlight._convertWheelRotation(value);
    engine.setValue('[Channel' + deck + ']', 'jog',
                    interval * DJCStarlight.bendScale);
};


// Bending on the jog wheel (rotating using the edge)
DJCStarlight.bendWheel = function(channel, control, value, status, group) {
    var deck = channel;
    DJCStarlight._bendWheelImpl(deck, value);
};


// Cue master button
DJCStarlight.cueMaster = function(channel, control, value, status, group) {
    // This button acts as a toggle. Ignore the release.
    if (value === 0) {
        return;
    }

    var masterIsCued = engine.getValue('[Master]', 'headMix') > 0;
    // Toggle state.
    masterIsCued = !masterIsCued;

    var headMixValue = masterIsCued ? 1 : -1;
    engine.setValue('[Master]', 'headMix', headMixValue);

    // Set LED (will be overwritten when [Shift] is released)
    var cueMasterLedValue = masterIsCued ? 0x7F : 0x00;
    midi.sendShortMsg(0x91, 0x0C, cueMasterLedValue);
};


// Cue mix button, toggles PFL / master split feature
// We need a special function for this because we want to turn on the LED (but
// we *don't* want to turn on the LED when the user clicks the headSplit button
// in the GUI).
DJCStarlight.cueMix = function(channel, control, value, status, group) {
    // This button acts as a toggle. Ignore the release.
    if (value === 0) {
        return;
    }

    // Toggle state.
    script.toggleControl('[Master]', 'headSplit');

    // Set LED (will be overwritten when [Shift] is released)
    var cueMixLedValue =
        engine.getValue('[Master]', 'headSplit') ? 0x7F : 0x00;
    midi.sendShortMsg(0x92, 0x0C, cueMixLedValue);
};


DJCStarlight.shiftButton = function(channel, control, value, status, group) {
    if (value >= 0x40) {
        // When Shift is held, light the LEDS to show the status of the alt
        // functions of the cue buttons.
        var cueMasterLedValue =
            engine.getValue('[Master]', 'headMix') > 0 ? 0x7F : 0x00;
        midi.sendShortMsg(0x91, 0x0C, cueMasterLedValue);
        var cueMixLedValue =
            engine.getValue('[Master]', 'headSplit') ? 0x7F : 0x00;
        midi.sendShortMsg(0x92, 0x0C, cueMixLedValue);
    } else {
        // When Shift is released, go back to the normal LED values.
        var cueChan1LedValue =
            engine.getValue('[Channel1]', 'pfl') ? 0x7F : 0x00;
        midi.sendShortMsg(0x91, 0x0C, cueChan1LedValue);
        var cueChan2LedValue =
            engine.getValue('[Channel2]', 'pfl') ? 0x7F : 0x00;
        midi.sendShortMsg(0x92, 0x0C, cueChan2LedValue);
    }
};

DJCStarlight.bassFilterButton = function(channel, control, value, status, group) {
    // The Bass / Filter button acts as a second "shift" button
    if (value) {
        DJCStarlight.bassShifted = true;
        // Maximize library after holding button for some time
        DJCStarlight.bassShiftTimer = engine.beginTimer(DJCStarlight.libraryMaximizeDelay, DJCStarlight._maximizeLibrary);
    } else {
        DJCStarlight.bassShifted = false;
        engine.stopTimer(DJCStarlight.bassShiftTimer);
        engine.setValue("[Master]", "maximize_library", false);
    }
};

DJCStarlight._maximizeLibrary = function(){
    engine.setValue("[Master]", "maximize_library", true);
}

DJCStarlight.shutdown = function() {
    // Reset base LED
    midi.sendShortMsg(0x90,0x24,0x7F);
};
