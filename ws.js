
// set object border thickness
CONFIG.Canvas.objectBorderThickness = 2;
//CONFIG.debug.hooks= true;
//Hooks.on('renderNotifications', ()=>{if (game.user.isGM) game.logOut()})


// do not show EZD6 mini sheets
Hooks.on('renderMiniCharSheet', (app, html)=>{
  html.css({display:'none'})
  html.ready(function(){app.close()})
})

Hooks.on('renderMiniMonsterSheet', (app, html)=>{
  html.css({display:'none'})
  html.ready(function(){app.close()})
})

Hooks.on('getEZD6CharacterSheetHeaderButtons',(app, buttons)=>{
  buttons.findSplice(b=>b.label=='Mini Sheet')
})


// add player targets under their token in the combat tracker
Hooks.on('renderCombatTracker', (app, html, options)=>{
  let combat = app.viewed;
  if (!combat) return;
  for (let c of combat.turns.filter(c=>c.players.length)) {
    let $targets = $('<span class="targets"></span>')
    let targets = [...c.players[0].targets].filter(t=>t.scene._id==combat.scene._id)
    for (let t of targets) $targets.append($(`<a class="target" style="margin: 0 3px;" data-id="${t.id}"><img src="${t.document.texture.src}"></a>`))
    html.find(`li.combatant[data-combatant-id="${c.id}"]`).find('.combatant-controls').after($targets)
  }
  html.find('.target').mouseover(function(e){
    let target = canvas.tokens?.get($(this).data().id);
    let $div = $(`<div id="${target.id}-marker" class="token-marker ${target.id}" style="position: absolute; top: ${target.y}px; left: ${target.x}px; display:block;" data-tokenid="${target.id}">
      <style>.token-marker {width: ${target.w}px; height: ${target.h}px; border: 3px solid red; border-radius: 8px;}</style></div>`);
      $('#hud').append($div);
  }).mouseout(function(e) {
    $('#hud').find('div.token-marker').remove();
  });
})
Hooks.on('targetToken', ()=>{
  ui.sidebar.tabs.combat.render(true);
  game.combats.apps.forEach(c=>c.render(true));
});



// rotate tokens toward new location before the movement animation
var tokenRotateThenMove = async function(tokenDocument, update){
  if (!update.x) update.x = tokenDocument.x;
  if (!update.y) update.y = tokenDocument.y;
  let r = new Ray(tokenDocument, update);
  let rotation = r.angle*180/Math.PI-90;
  if (rotation < 0) rotation += 360;
  let difference = Math.max(tokenDocument.rotation, rotation) - Math.min(tokenDocument.rotation, rotation)
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  let duration = Math.abs(difference)*tokenDocument.width;
  if (!tokenDocument.lockRotation) {
    await tokenDocument.update({rotation}, {animate:true, animation:{duration}});
    await new Promise((r) => setTimeout(r, duration));
  }
  duration = r.distance*3;
  await tokenDocument.update(update, {rotated: true, animate:true, animation:{duration: 750}})
}

Hooks.on("preUpdateToken", (tokenDocument, update, options) => {
  if ((update.hasOwnProperty('x') || update.hasOwnProperty('y'))){
    if (options.hasOwnProperty('rotated')) return true;
    tokenRotateThenMove(tokenDocument, update);
    return false;
  }
});

// dragging a token will show it's new rotation and a grabbing cursor
Hooks.on('refreshToken', (token)=>{
  if (token.layer.preview?.children[0]) {
    let clone = token.layer.preview?.children.find(c=>c.id==token.id)
    if (!clone) return;
    let r = new Ray(canvas.scene.tokens.get(token.id), clone)
    clone.mesh.angle = r.angle*180/Math.PI-90;
    token.cursor = 'grabbing';
  }
});

// prevent players from adding EZD6 resources
Hooks.on("preUpdateActor", (actor, update, options) => {
  if (game.user.isGM) return;
  if (foundry.utils.hasProperty(update, 'system.karma') ){
    delete update.x
  }
});


// created tokens have default cursor for non-owners
Hooks.on("createToken", (data) => {
  let token = canvas.tokens.get(data.id)
  if (!token.owner) token.cursor = "default"
})

// placed tokens have default cursor for non-owners
Hooks.once("canvasReady", () => {
  canvas.tokens.placeables.forEach(t => {
      if (!t.owner) t.cursor = "default"
  })
})

// no token borders
Hooks.on('init', ()=>{
  console.log('registering token prototype hooks')
  libWrapper.register('ws', 'Token.prototype._refreshBorder', function(wrapped, ...args){
    
    this.border.clear();
    if (!this.controlled) return;
    wrapped(...args);
  }, 'MIXED')

  libWrapper.register('ws', 'PlaceableObject.prototype.clone', function(wrapped, ...args){
    if (this.isPreview) this.cursor = 'grabbing';
    return wrapped(...args);
  }, 'WRAPPER')
  
  libWrapper.register('ws', 'Token.prototype._onDragLeftDrop', function(wrapped, ...args){
    this.cursor = 'pointer';
    wrapped(...args);
  }, 'MIXED')
})

// do not show the game as paused for players 
/*
Hooks.on('ready', ()=>{
  if (!game.user.isGM) $('head').append($(`<style>#pause{display:none;}</style>`));
});
*/

// hide ui from players
/*
Hooks.on('ready', ()=>{
  if (game.user.isGM) return;
  //$('head').append($('<style>#interface, #board {display:none !important;}</style>'))
  $('#interface').remove();

  game.user.character.sheet.render(true)
})
*/

// #inline-table-rolls
CONFIG.TextEditor.enrichers.push({pattern:/\[\[#(.*?)\]\]/gi, enricher: async function enricher (match, options){
  let tableName = match[0].replace(`[[#`,``).replace(`]]`,``).trim();
  let tableRoll = await game.tables.getName(tableName).roll();
  if (!tableRoll) return match[0];
  let element = $(`<span>${tableRoll.results[0].text}</span>`)[0];
  return element;
}});
// !inline-chats
/*
//CONFIG.TextEditor.enrichers.findSplice((f)=>f.enricher.toString().includes("//!inline-chats"))
CONFIG.TextEditor.enrichers.push({pattern:/\[\[!(.*?)\]\]/gi, enricher:  function enricher (match, options){
  
  let text = match[0].replace(`[[!`,``).replace(`]]`,``).trim();
  //if (!!options.relativeTo) text = Roll.replaceFormulaData(text, options.relativeTo.getRollData());
  //let text = match[0].replace('{{!','').replace('}}','').trim();
  let icon = text.at(0)==='/'?'':'<i class="far fa-comments"></i>&nbsp;';
  let element = $(`<a onclick="ui.chat.processMessage($(this).clone().children().remove().end().text().replace('{{','[[').replace('}}',']]'));" class="inline-chat">${icon}${text}</a>`)[0];
  //console.log(element);
  return element;
}});
*/

// discord-like formatting potentially breaks things
/*
CONFIG.TextEditor.enrichers.push({pattern:/(~){2}(.+)(~){2}/g, enricher:  function enricher (match, options){
  if (match[0].includes('<')) return match[0];
  return $(match[0].replace('~~', `<s>`).split('').reverse().join('').replace('~~',`>s/<`).split('').reverse().join(''))[0];
}});

CONFIG.TextEditor.enrichers.push({pattern:/(_){2}(.+)(_){2}/g, enricher:  function enricher (match, options){
  if (match[0].includes('<')) return match[0];
  return $(match[0].replace('__', `<u>`).split('').reverse().join('').replace('__',`>u/<`).split('').reverse().join(''))[0];
}});

CONFIG.TextEditor.enrichers.push({pattern:/(`){1}(.+)(`){1}/g, enricher:  function enricher (match, options){
  if (match[0].includes('<')) return match[0];
  return $(match[0].replace('`', `<code>`).split('').reverse().join('').replace('`',`>edoc/<`).split('').reverse().join(''))[0];
}});

CONFIG.TextEditor.enrichers.push({pattern:/\*{2}(.+)\*{2}/gi, enricher:  function enricher (match, options){
  if (match[0].includes('<')) return match[0];
  return $(match[0].replace(`**`,`<b>`).split('').reverse().join('').replace(`**`,`>b/<`).split('').reverse().join(''))[0];
}});

CONFIG.TextEditor.enrichers.push({pattern:/\*{1}(.+)\*{1}/gi, enricher:  function enricher (match, options){
  if (match[0].includes('<')) return match[0];
  let $el = $(match[0].replace(`*`,`<i>`).split('').reverse().join('').replace(`*`,`>i/<`).split('').reverse().join(''))
  return $el[0];
}});
*/

// add assign as character option to actor directory
Hooks.on('getActorDirectoryEntryContext', (app, options)=>{
  options.push(
    {
      "name": `Assign as Character`,
      "icon": `<i class="fa-solid fa-user"></i>`,
      "element": {},
      condition: li => {
        const actor = game.actors.get(li.data("documentId"));
        return actor.isOwner;
      },
      callback: li => {
        game.user.update({character: li.data("documentId")})
      }
    }
  )
})

// position sidebar popouts next to sidebar
Hooks.on('renderSidebarTab', (app, html, options)=>{
  //console.log(app, html, options)
  //app.options.classes.push('resizable')
  //app.options.resizable=true;
  //options.resizable=true;
  
  if (app._priorState>0) return;
  //html.append('<div class="window-resizable-handle"><i class="fas fa-arrows-alt-h"></i></div>')
  app.setPosition({top : 0, left : (ui.sidebar._collapsed?window.innerWidth-340:window.innerWidth-610), height: (options.tabName=="chat"?window.innerheight-30:'auto')});
});

// focus search input on macro directory on refresh
Hooks.on("renderMacroDirectory", (app, html)=>{
  html.find("input[name='search']").focus();
})

// delete all of an actor's tokens from scenes when the actor is deleted
Hooks.on('deleteActor', async (actor)=>{
  let tokens = actor.getActiveTokens();
  await Promise.all(tokens.map(async t=> { return await t.scene.deleteEmbeddedDocuments("Token", [t.document.id])}))
  return true;
})

// set scene defaults
Hooks.on('preCreateScene', (scene)=>{
  scene.data.update({
    fogExploration:false, 
    //background: {src:"assets/maps/Cragmaw%20Castle.jpg"},
    backgroundColor:"#292929"
   //, grid: {alpha:1, color: "#0000FF"}
  })
})

// prevent players from changing their tokens
/*
Hooks.on('preUpdateToken',(token, update, options, userId)=>{
    if (!game.users.get(userId).isGM) {
        ui.notifications.warn("Players cannot modify their tokens");
        return false;
    }
});
*/

// make image popout's draggable so you can drag them to editors
Hooks.on('renderImagePopout', (app, html)=>{
  html.find('img').attr('draggable', true)
});

// collapse journal page headers and add toggle button & make journal images draggable
Hooks.on('renderJournalPageSheet', (JournalSheet, html)=>{
  html.find('img').attr('draggable', true).on('dragstart',function(e) {
    e.srcElement = null;
    let el =  $(this).clone().removeAttr('style')
    el = el.prop('outerHTML');
    console.log(el);
    console.log(e.originalEvent.dataTransfer)
    e.originalEvent.dataTransfer.clearData();
    e.originalEvent.dataTransfer.setData("text", el);
    console.log(e.originalEvent)
    //e.originalEvent.dataTransfer.effectAllowed = "all";
  });

  let appHTML = html.closest('.app')
  appHTML.find(`li.directory-item`).find('.headings').hide();
  //html.find(`li[data-page-id="${JournalSheet.object._id}"] > div`).next().hide();
  //html.find(`li.directory-item > div > a.toggle`).remove();
  //html.find(`li[data-page-id="${JournalSheet.object._id}"] > div > a.toggle`).remove();
  let $button = $(`<a class="toggle" style="width:50px; text-align: right; padding-right: .5em;"><i class="fa-solid fa-caret-down"></i></a>`)
  .click(function(){
    //console.log('test', $(this).parent().next())
    $(this).parent().next().toggle();
    $(this).parent().next().is(':hidden')?$(this).html('<i class="fa-solid fa-caret-down"></i>'):$(this).html('<i class="fa-solid fa-caret-up"></i>')
    //$(this).parent().next().toggle();
    //$(this).parent().next().is(':hidden')?$(this).html('<i class="fa-solid fa-caret-down"></i>'):$(this).html('<i class="fa-solid fa-caret-up"></i>')
  })
  //html.find(`li[data-page-id="${JournalSheet.object._id}"] > div`).append($button)
  appHTML.find(`li.directory-item > div`).each(function(){
    if ($(this).next().length) $button.clone(true).appendTo($(this))
  })
});

// rearrange token hud controls & add token delete control
Hooks.on('renderTokenHUD', (app, html, hudData)=>{
  html.find('div[data-action="visibility"] img').replaceWith(`<i class="fas fa-eye-slash"></i>`);
  if (!game.user.isGM) return;
  let $del = $(`<div class="control-icon delete" title="Delete"><i class="fas fa-trash"></i></div>`).click(function(){
    canvas.scene.deleteEmbeddedDocuments("Token", canvas.tokens.controlled.map(t=>t.id));
  });
  html.find('.col.right').append($del);
  let $actorsheet = $(`<div class="control-icon actor-sheet" title="Actor Sheet"><i class="fas fa-user"></i></div>`).click(function(){
    app.object.document.actor.sheet.render(true)
  });
  html.find('.col.left').append($actorsheet);
  html.find('div.control-icon[data-action="config"]').appendTo('.col.left');
  html.find('div.open-mini').remove()
});

// turn timer macro automation 
/*
Hooks.on("updateCombat", (combat, updates) => {
  if (!game.combat?.started)
    return game.macros.getName("Cancel Turn Timer")?.execute();
  if ("turn" in updates) 
    game.macros.getName("Turn Timer")?.execute();
});
*/

// set chat control icon event
/*
$('#chat-controls').find('.chat-control-icon').click(()=>{
  //ui.chat.processMessage('/m Dice Tray');
})
*/

// add scroll to bottom button for to chat controls
Hooks.on('renderChatLog', (app, html)=>{
  html.find(`div.control-buttons`).css('flex', '0 0 auto').append(`<a class="scroll-bottom" style="float:right;" onclick="ui.chat.scrollBottom()"><i class="fas fa-down"></i></a>`);
  html.find('#chat-form').css('flex', '0 0 80px');
  //html.find('.chat-control-icon').click(()=>{ui.chat.processMessage('/m Dice Tray');})
});

// allow GM to delete dice terms from chat rolls by clicking on them
/*
Hooks.on('itit', ()=>{
if (game.user.isGM) 
Hooks.on('renderChatMessage', (message, html)=>{
  if (!message.rolls[0]) return;
  console.log()
  html.find('div.dice-formula').html(message.rolls[0].terms.reduce((acc, t, i)=>acc+=`<a class="term" data-index="${i}">${t.formula}</a>`,``));
  html.find(`a.term`).click(async function(e) {
    e.preventDefault()
    let roll = message.rolls[0];
    let rollTermsBackup = [...roll.terms];
    try {
      roll.terms.splice(parseInt($(this).attr('data-index')), 1);
      roll.terms = roll.terms.filter(t=>t.number!==0||!!t.flavor)
      roll.terms = roll.terms.filter((c, i)=>!c.operator||c.operator!=='+'||c.operator!==roll.terms[i+1]?.operator)
      if (roll.terms[roll.terms.length-1]?.operator) roll.terms.pop();
      if (roll.terms[0]?.operator && roll.terms[0].operator==="+") roll.terms.shift();
      if (!roll.terms.length) roll.terms = Roll.parse('0');
      roll._evaluated=false;
      roll._total=null;
      roll._formula = roll.formula;
      await roll.evaluate();
      roll._formula = roll.formula;
    } catch (err) {
      roll.terms = rollTermsBackup;
      roll._evaluated=false;
      roll._total=null;
      roll._formula = roll.formula;
      await roll.evaluate();
      return console.log(err);
    }
    await message.update( {content:roll.total, roll:JSON.stringify(roll)});
  });
});
})
*/

//CONFIG.sounds.dice=null;

// style dice roll messages
Hooks.on('renderChatMessage', (message, html)=>{
  if (!message.rolls[0]) return;
  //if (!message.rolls[0]?.terms) return;
  if (message.data.user === game.user.id && $("#Dice-Tray-Dialog").length) {
    $(`.dice-formula`).removeAttr('style');
    html.find(`.dice-formula`).attr('style',"border: 1px solid red !important;");
    $('#Dice-Tray-Dialog').find('.message-id').val(message.id);
    $(`#Dice-Tray-Dialog > header > h4 > .last-message`).click();
  }
  //console.log(html.find(`div.dice-tooltip`));
  //html.find(`div.dice-tooltip`).css('display','block')
  let $diceTooltip = $(`<div class="dice-tooltip" style="display:block">`)
  let $tooltipPart = $(`<section class="tooltip-part">`)
  let $dice = $('<div class="dice">')
  let $ol = $('<ol class="dice-rolls" style="display:flex; justify-content: center; flex-wrap: wrap;">')
  html.find("li.roll.die").each(function(){
    $ol.append($(this).clone());
  });
  html.find(".dice-tooltip").remove()
  $dice.append($ol);
  $tooltipPart.append($dice);
  $diceTooltip.append($tooltipPart)
  html.find("div.dice-formula").after($diceTooltip);
});

// effect countdown
/*
Hooks.on("updateCombat", (combat) => {
  console.log(combat.combatant)
  let update = combat.combatant.actor.effects.filter(e=>e.data.icon.includes('assets/ffffff/transparent/1x1/skoll/dice-six-faces')).map(e=>{if (e.data.duration.startTurn === game.combats.active.turn) return{_id: e.id, icon: `assets/ffffff/transparent/1x1/skoll/dice-six-faces-${e.data.duration.rounds - (game.combats.active.round - e.data.duration.startRound) }.svg`}})
  if (update.length) combat.combatant.actor.updateEmbeddedDocuments("ActiveEffect", update);
});
*/

// function for creating a dialog that might get created again with the same id
Object.getPrototypeOf(Dialog).persist = function(data, options) {
  let w = Object.values(ui.windows).find(w=> w.id===options.id);
  let position = w?.position || {};
  options = {...options, ...position};
  new Dialog(data, options).render(true);
  if (w) w.bringToTop();
  if (w) w.setPosition({height:'auto'})  
  return;
}

const getActorByUuid = async function (uuid) {
  const actorToken = await fromUuid(uuid);
  const actor = actorToken?.actor ? actorToken?.actor : actorToken;
  return actor;
}

// log actor changes to a journal
/*
Hooks.on('updateActor', async (actor, updateData, options, userId) => {
  let log = game.journal.getName('Actor Change Log');
    await log.update({content: $(log.data.content).find('#ActorLog').prepend(`<div>${game.users.get(userId).name}  </div><div> ${actor.name}</div><div> ${JSON.stringify(updateData)})}</div>`).prevObject[0].outerHTML});
});  
*/

// add maximize button to macro config
Hooks.on(`getMacroConfigHeaderButtons`,  (app, buttons) => { 
  buttons.unshift({
    label: 'Maximize',
    class: 'Maximize',
    icon: 'far fa-window-maximize',
    onclick: ()=>{
      ui.windows[app.appId].setPosition({top:5, left:5, })
      ui.windows[app].appId].setPosition({height: window.innerHeight - 50, width: window.innerWidth - 315})} 
  });
});

// put created macros in the user's folder
Hooks.on(`createMacro`, async (macro) => { 
  let u = game.user;
  let userMacroFolder = game.folders.find(f => f.name === u.name && f.type === 'Macro');
  //if (!userMacroFolder) userMacroFolder = await Folder.create({name : u.name , type : 'Macro'});
  await macro.update({type: "script"});
});

// move expand sidebar control to the top to match where the collapse control is when expanded
Hooks.on('collapseSidebar', (sidebar, collapsed)=>{
  if (collapsed) sidebar.element.find('#sidebar-tabs').prepend($('#sidebar').find('a.collapse[data-tooltip="Collapse or Expand"]'))
  else sidebar.element.find('#sidebar-tabs').append($('#sidebar').find('a.collapse[data-tooltip="Collapse or Expand"]'))
})

// on ready
Hooks.on('ready', ()=>{
  // hide up macro config options and create toggle
  Hooks.on(`renderMacroConfig`, (app, html) => { 
    html.find('div.form-group').toggle();
      html.find('div.form-group.command').show();
    //html.find('div.form-group').find('select[name="type"]').find('option[value="script"]')[0].selected = true;
    html.find('textarea[name="command"]').prev().append('<a name="options" style="float: right; clear: both;">options</a>')
    html.find('a[name="options"]').click(()=>{
      html.find('div.form-group').toggle();
      html.find('div.form-group.command').show();
    });
    html.find('header.sheet-header > img').removeAttr('height').removeAttr('width');
    html.find('header.sheet-header > img').attr('style', "height:32px !important; width:32px !important; flex: unset");
    html.find('header.sheet-header h1 input ').attr('style', "height: 32px; line-height: 30px; margin: 8px; width:  calc(100% - 8px)");
  });
  
  // collapse sidebar
  ui.sidebar.collapse()
});

// add buttons to scene config to activate or view scene
Hooks.on('renderSceneConfig', (app, html)=>{
  let $viewButton = $(`<button name="view"><i class="fas fa-eye fa-fw"></i> View</button>`).click(function(){app.document.view()});
  let $activateButton = $(`<button name="activate"><i class="fas fa-bullseye fa-fw"></i> Activate</button>`).click(function(){app.document.activate()});
  html.find('button[type="submit"]').after($activateButton).after($viewButton);
  app.setPosition({height: 'auto'})
});

// allow scenes to be viewed by dropping to the canvas and holding shift will activate the scene
Hooks.on('dropCanvasData', (canvas, data)=>{
  if (!game.user.isGM) return;
  if (data.type == "Scene") {
    if (event.shiftKey) fromUuidSync(data.uuid).activate();
    else fromUuidSync(data.uuid).view();
    return false;
  }
});

// add apply button to macro config (from Monk's Little Details)
Hooks.on("renderMacroConfig", (app, html, data) => {
  $('.sheet-footer', html).prepend(
      $("<button>")
          .attr("type", "button")
          .html('<i class="fas fa-file-download"></i> Apply')
          .on("click", (event) => { app._onSubmit.call(app, event, { preventClose: true }) }));
})

// add target flags to chat messages
/*
if (!Hooks.events.preCreateChatMessage || Hooks.events.preCreateChatMessage?.findIndex(f=>f.fn.toString().includes('chatmessagetargetflags'))==-1)
  Hooks.on(`preCreateChatMessage`, async (message, data, options, user) => {
    
    if (message.data.flavor?.toUpperCase().includes('ATTACK') || message.data.flavor?.toUpperCase().includes('CAST'))
      message.data.update({"flags.world.targetIds": [...game.user.targets].filter(t=>t.visible).map(t=>t.id)});
    
    if (message.data.flavor?.toUpperCase().includes('DAMAGE')) {
      let dt = message.data.flavor.split(' ')[message.data.flavor.split(' ').indexOf('Damage')-1] || 'null';
      message.data.update({"flags.world.damageType": dt});
    }
    
    if (message.data.flavor?.toUpperCase().includes('HEALING')) {
      message.data.update({"flags.world.targetIds": [...game.user.targets].filter(t=>t.visible).map(t=>t.id)});
      message.data.update({"flags.world.damageType": 'Healing'});
    }
    
    if (message.data.flavor?.toUpperCase().includes('ROLLING SAVES'))
      message.data.update({"flags.world.targetIds": [...game.user.targets].filter(t=>t.visible).map(t=>t.id)});
    
  });
*/

// give all player's observer permissions to journals created by players
Hooks.on('preCreateJournalEntry', (journal)=>{
  if (!game.user.isGM)
    journal.data.update({"permission.default":CONST.DOCUMENT_PERMISSION_LEVELS.OBSERVER});
});

// prevent users from deleting messages with rolls
Hooks.on('preDeleteChatMessage', (message)=>{
  if (!game.user.isGM && message.rolls?.length) {
    ui.notifications.warn("No deleting rolls");
    return false;
  }
});

// add scene controls
/*
Hooks.on("getSceneControlButtons",(controlButtons) => {
  
    if (game.user.isGM)
    controlButtons.find(b => b.layer === "tokens").tools.push(
        {
            name: "request-roll",
            title: "Request Roll",
            icon: "fas fa-dice-d20",
            button: true,
            onClick: async () => {
                game.macros.find(m=>m.data.flags.world?.name==='Whisper Request Inline Roll').execute();
            }
        }
    );
    controlButtons.find(b => b.layer === "tokens").tools.unshift(
        {
            name: "actor-menu",
            title: "Actor Menu",
            icon: "fas fa-list",
            button: true,
            onClick: () => {
              game.macros.find(m=>m.data.flags.world?.name==='Actor Menu').execute();
            }
        }
    );
    controlButtons.find(b => b.layer === "tokens").tools.splice(3, 0,
        {
            name: "clear-targets",
            title: "Clear Targets",
            icon: "fas fa-remove-format",
            button: true,
            onClick: async () => {
                await game.user.updateTokenTargets([]);
            }
        }
    );
});
*/
