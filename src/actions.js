import { createAction } from 'redux-act'

import canvas from './canvas'
import storage from './storage'
import { getEmptyItemState } from './selectors'
import { asUrl, textToHtml } from './utils'

// Clean the canvas and show an empty item
export function initCanvas() {
    return function(dispatch, getState) {
        // Clean canvas
        dispatch(canvas.removeAllItems())

        // Add and show welcome message + friends for demo purposes.
        {
            // Add and show a note to introduce
            let docId0 = 'welcomeMessage'
            {
                const welcomeMessage = (
                    'Hi! This is a read/write web browser. '
                    + 'It lets you <i>create</i> notes and links, to organise the web your way. '
                    + 'It is far from finished, but click this note to browse more info, '
                    + 'or enter a URL or note in the bar below.'
                )
                // Store as note, specifying docId to overwrite any older one.
                dispatch(storage.addNote({docId: docId0, text: welcomeMessage}))
                // Display it
                let props = {x: 50, y: 50, width: 500, height: 150}
                dispatch(canvas.createItem({docId: docId0, props}))
            }
            // Create some more documents and links as initial content
            {
                let docId1 = dispatch(storage.findOrAddUrl({url: 'https://rwweb.org'}))
                let docId1_1 = dispatch(storage.findOrAddUrl({url: 'https://www.w3.org/People/Berners-Lee/WorldWideWeb.html'}))
                let docId1_2 = dispatch(storage.findOrAddUrl({url: 'https://www.w3.org/History/1989/proposal.html'}))
                let docId1_3 = dispatch(storage.findOrAddUrl({url: 'http://www.theatlantic.com/magazine/archive/1945/07/as-we-may-think/303881/'}))
                let docId2 = dispatch(storage.findOrAddUrl({url: 'https://www.youtube.com/embed/vKzYmDUydTw'}))
                let docId3 = dispatch(storage.findOrAddUrl({url: 'http://iannotate.org'}))

                dispatch(storage.findOrAddLink({source: docId0, target: docId1}))
                dispatch(storage.findOrAddLink({source: docId1, target: docId1_1}))
                dispatch(storage.findOrAddLink({source: docId1, target: docId1_2}))
                dispatch(storage.findOrAddLink({source: docId1, target: docId1_3}))
                dispatch(storage.findOrAddLink({source: docId0, target: docId2}))
                dispatch(storage.findOrAddLink({source: docId2, target: docId3}))
            }
        }

        // Show empty item in center
        {
            let props = {x: 100, y: 100, width: 400, height: 50}
            let itemId = dispatch(canvas.createItem({docId: 'emptyItem', props}))
            dispatch(canvas.centerItem({itemId}))
            dispatch(canvas.focusItem({itemId}))
        }

    }
}

// Put a doc in the center of view, with its linked docs around it.
// Accepts either a docId or ItemId.
export function drawStar({docId, itemId}) {
    return function (dispatch, getState) {
        let state = getState()
        if (docId === undefined) {
            docId = canvas.getItem(state.canvas, itemId).docId
        }
        let {targetDocIds, sourceDocIds} = storage.getFriends(state.storage, docId)
        targetDocIds.push('emptyItem')
        dispatch(canvas.centerDocWithFriends({docId, itemId, targetDocIds, sourceDocIds, animate: true}))

        // Show second level friends
        targetDocIds.forEach(docId => {
            let itemId = canvas.getItemIdForDocId(getState().canvas, docId)
            let {targetDocIds, sourceDocIds} = storage.getFriends(getState().storage, docId)
            dispatch(canvas.showItemFriends({itemId, friendDocIds: targetDocIds, side: 'right', animate:true}))
        })
        sourceDocIds.forEach(docId => {
            let itemId = canvas.getItemIdForDocId(getState().canvas, docId)
            let {targetDocIds, sourceDocIds} = storage.getFriends(getState().storage, docId)
            dispatch(canvas.showItemFriends({itemId, friendDocIds: sourceDocIds, side: 'left', animate:true}))
        })
    }
}

// Pass either docId or userInput
export function navigateTo({itemId, docId, userInput}) {
    return function (dispatch, getState) {
        dispatch(populateEmptyItem({itemId, docId, userInput}))
        dispatch(drawStar({itemId}))
        dispatch(canvas.focusItem({itemId}))
    }
}

function populateEmptyItem({itemId, docId, userInput}) {
    return function (dispatch, getState) {
        if (docId===undefined) {
            // Find or create the entered webpage/note
            docId = dispatch(findOrCreateDoc({userInput}))
        }
        // Show the document in the given item
        dispatch(canvas.changeDoc({itemId, docId}))
        // Link the new doc to any items it has edges to
        dispatch(linkToConnectedItems({itemId, docId}))
    }
}

function findOrCreateDoc({userInput}) {
    return function (dispatch, getState) {
        let docId
        // If it looks like a URL, we treat it like one.
        let url = asUrl(userInput)
        if (url) {
            docId = dispatch(storage.findOrAddUrl({url}))
        }
        else {
            // Search if we have the text as a note/tag
            docId = storage.getDocWithText(getState().storage, userInput)
            // If not, create a new note
            if (!docId) {
                let action = storage.addNote({text: userInput})
                dispatch(action)
                docId = storage.readGeneratedId(action)
            }
        }
        return docId
    }
}

function linkToConnectedItems({itemId, docId}) {
    return function(dispatch, getState) {
        let connectedItemIds = canvas.getConnectedItemIds(getState().canvas, itemId)
        connectedItemIds.forEach(connectedItemId => {
            let item = canvas.getItem(getState().canvas, itemId)
            let connectedItem = canvas.getItem(getState().canvas, connectedItemId)

            // Determine which is item is left and which right
            let docIsLeft = (item.x+item.width/2) < (connectedItem.x+connectedItem.width/2)

            // Create the link
            dispatch(storage.findOrAddLink({
                source: docIsLeft ? docId : connectedItem.docId,
                target: docIsLeft ? connectedItem.docId : docId,
            }))
        })
    }
}

export function handleDropOnCanvas({x, y, event}) {
    return function (dispatch, getState) {
        let html = event.dataTransfer.getData('text/html')
        let text = event.dataTransfer.getData('text')
        let url = event.dataTransfer.getData('URL') || asUrl(text)
        let docId
        if (url) {
            docId = dispatch(storage.findOrAddUrl({url}))
        }
        else if (html) {
            html = html.replace(String.fromCharCode(0), '') // work around some bug/feature(?) of Chromium
            docId = dispatch(storage.findOrAddNote({text: html}))
        }
        else if (text) {
            let html = textToHtml(text)
            docId = dispatch(storage.findOrAddNote({text: html}))
        }
        if (docId) {
            let width = 200
            let height = 150
            let props = {x: x-width/2, y: y-height/2, width, height}
            let itemId = dispatch(canvas.createItem({docId, props}))
        }
    }
}

export function handleTap({itemId}) {
    return function (dispatch, getState) {
        // Focus on the item
        dispatch(canvas.focusItem({itemId}))

        let item = canvas.getItem(getState().canvas, itemId)
        if (item.docId === 'emptyItem')
            return
        if (item.centered) {
            // Only expand iframe items (TODO make simple type test)
            if (storage.getDoc(getState().storage, item.docId).url)
                dispatch(canvas.expandItem({itemId, animate: true}))
        }
        else {
            dispatch(drawStar({itemId}))
        }
    }
}

export function handleDraggedOut({itemId, dir}) {
    return function (dispatch, getState) {
        let item = canvas.getItem(getState().canvas, itemId)
        let docId = item.docId

        if (dir==='left' || dir==='right') { // No difference for now

            // Remove the item's _visible_ links from storage
            let connectedItemIds = canvas.getConnectedItemIds(getState().canvas, itemId)
            connectedItemIds.forEach(connectedItemId => {
                let connectedDocId = canvas.getItem(getState().canvas, connectedItemId).docId
                dispatch(storage.deleteLink({
                    doc1: connectedDocId,
                    doc2: docId,
                }))
            })

            // Hide the item from the canvas
            dispatch(canvas.hideItem({itemId}))

            // Delete jettisoned doc completely if it is left unconnected
            if (!storage.hasFriends(getState().storage, docId)) {
                dispatch(storage.deleteDoc({docId}))
            }
        }

    }
}

export function updateAutoSuggest({itemId}) {
    return function(dispatch, getState) {
        // Tell UI to show suggestions for the current input
        dispatch(updateEmptyItemSuggestions({itemId}))
        // Let store search for suggestions
        let inputValue = getEmptyItemState(getState(), itemId).inputValue
        let suggestions = storage.autoSuggestSearch(getState().storage, {inputValue})
        // Update list of suggestions for this user input
        dispatch(setAutoSuggestSuggestions({inputValue, suggestions}))
    }
}

export let setAutoSuggestSuggestions = createAction()
export let setEmptyItemValue = createAction()
export let updateEmptyItemSuggestions = createAction()
