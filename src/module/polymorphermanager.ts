import type { TokenData } from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/module.mjs';
import { ANIMATIONS } from './animations';
import { PolymorpherData, PolymorpherFlags } from './automatedPolymorpherModels';
import CONSTANTS from './constants';
import { i18n, wait, warn } from './lib/lib';

export class PolymorpherManager extends FormApplication {
  // caster: Actor;
  summons: any[] | undefined;
  // spellLevel: number | undefined;
  actor: Actor;
  token: Token;

  constructor(actor: Actor, token: Token, summonData?: PolymorpherData[]) {
    super({});
    // this.caster = actor;
    this.summons = summonData;
    // this.spellLevel = spellLevel;
    this.actor = actor;
    this.token = token;
  }

  static get defaultOptions() {
    return {
      ...super.defaultOptions,
      title: i18n(`${CONSTANTS.MODULE_NAME}.dialogs.polymorpherManager.title`),
      id: 'polymorpherManager',
      template: `modules/${CONSTANTS.MODULE_NAME}/templates/polymorphermanager.hbs`,
      resizable: true,
      width: 400,
      height: window.innerHeight > 400 ? 400 : window.innerHeight - 100,
      dragDrop: [{ dragSelector: null, dropSelector: null }],
    };
  }

  getData(): any {
    const data = <any>super.getData();
    data.random = this.actor.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.RANDOM) ?? false;
    data.ordered = this.actor.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.ORDERED) ?? false;
    return data;
  }

  async activateListeners(html) {
    html
      .find('#polymorpher-list')
      .before(
        `<div class="searchbox"><input type="text" class="searchinput" placeholder="Drag and Drop an actor to add it to the list."></div>`,
      );
    this.loadPolymorphers();
    html.on('input', '.searchinput', this._onSearch.bind(this));
    html.on('click', '#remove-polymorpher', this._onRemovePolymorpher.bind(this));
    html.on('click', '#summon-polymorpher', this._onSummonPolymorpher.bind(this));
    html.on('click', '.actor-name', this._onOpenSheet.bind(this));
    html.on('dragstart', '#polymorpher', async (event) => {
      event.originalEvent.dataTransfer.setData('text/plain', event.currentTarget.dataset.elid);
    });
    html.on('dragend', '#polymorpher', async (event) => {
      event.originalEvent.dataTransfer.setData('text/plain', event.currentTarget.dataset.elid);
    });
  }

  _onSearch(event) {
    const search = <string>$(event.currentTarget).val();
    this.element.find('.actor-name').each(function () {
      if ($(this).text().toLowerCase().includes(search.toLowerCase())) {
        $(this).parent().slideDown(200);
      } else {
        $(this).parent().slideUp(200);
      }
    });
  }

  _onDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch {
      data = event.dataTransfer.getData('text/plain');
    }
    const li = this.element.find(`[data-elid="${data}"]`);
    if (li.length && !$(event.target).hasClass('nodrop')) {
      const target = $(event.target).closest('li');
      if (target.length && target[0].dataset.elid != data) {
        $(li).remove();
        target.before($(li));
      }
    }
    if (!data?.type) {
      // || data?.type !== 'Actor'){
      return;
    }
    this.element.find('#polymorpher-list').append(
      this.generateLi({
        id: data.id,
        name: data.name,
        animation: '',
        number: 0,
        defaultsummontype: '',
      }),
    );
    this.saveData();
  }

  async _onSummonPolymorpher(event) {
    this.minimize();
    const animation = <string>$(event.currentTarget.parentElement.parentElement).find('.anim-dropdown').val();
    const aId = event.currentTarget.dataset.aid;
    const aName = event.currentTarget.dataset.aname;
    const actorToTransform = <Actor>game.actors?.get(aId);
    if (!actorToTransform) {
      warn(
        `The actor you try to polimorphing not exists anymore, please set up again the actor on the polymorpher manager`,
        true,
      );
      return;
    }
    // const duplicates = <number>$(event.currentTarget.parentElement.parentElement).find('#polymorpher-number-val').val();
    const tokenDataToTransform = <TokenData>await actorToTransform.getTokenData();
    //@ts-ignore
    // const tokenFromTransform = await warpgate.crosshairs.show({
    //   size: Math.max(tokenData.width,tokenData.height)*tokenData.scale,
    //   icon: `modules/${CONSTANTS.MODULE_NAME}/assets/black-hole-bolas.webp`,
    //   label: "",
    // });
    // if (tokenFromTransform.cancelled) {
    //   this.maximize();
    //   return;
    // }
    let tokenFromTransform = <Token>canvas.tokens?.placeables.find((t: Token) => {
        return t.actor?.id === this.actor.id;
      }) || undefined;
    if (this.token) {
      tokenFromTransform = this.token;
    }
    // Get the target actor
    const sourceActor = actorToTransform;
    // if (data.pack) {
    //   const pack = game.packs.find(p => p.collection === data.pack);
    //   sourceActor = await pack.getEntity(data.id);
    // } else {
    //   sourceActor = game.actors.get(data.id);
    // }
    if (!sourceActor) {
      return;
    }
    if (game.system.id === 'dnd5e') {
      const canPolymorph = game.user?.isGM || (this.actor.isOwner && game.settings.get('dnd5e', 'allowPolymorphing'));
      if (!canPolymorph) {
        warn(`You mus enable the setting 'allowPolymorphing' for the dnd5e system`, true);
        return false;
      }

      // Define a function to record polymorph settings for future use
      const rememberOptions = (html) => {
        const options = {};
        html.find('input').each((i, el) => {
          options[el.name] = el.checked;
        });
        const settings = mergeObject(<any>game.settings.get('dnd5e', 'polymorphSettings') || {}, options);
        game.settings.set('dnd5e', 'polymorphSettings', settings);
        return settings;
      };

      // Prepare flag for revert ???
      let updatesForRevert: any = {};
      if (!this.actor?.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.UPDATES_FOR_REVERT)) {
        updatesForRevert = {
          tokenData: this.token.data,
          actorData: this.actor.data,
        };
      } else {
        updatesForRevert = this.actor?.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.UPDATES_FOR_REVERT);
      }
      await this.actor?.setFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.UPDATES_FOR_REVERT, updatesForRevert);

      // Create and render the Dialog
      return new Dialog(
        {
          title: i18n('DND5E.PolymorphPromptTitle'),
          //@ts-ignore
          content: {
            options: game.settings.get('dnd5e', 'polymorphSettings'),
            //@ts-ignore
            i18n: CONFIG.DND5E.polymorphSettings,
            isToken: this.actor.isToken,
          },
          default: 'accept',
          buttons: {
            accept: {
              icon: '<i class="fas fa-check"></i>',
              label: i18n('DND5E.PolymorphAcceptSettings'),
              callback: async (html) => {
                if (tokenFromTransform) {
                  if (typeof ANIMATIONS.animationFunctions[animation].fn == 'string') {
                    game.macros
                      ?.getName(ANIMATIONS.animationFunctions[animation].fn)
                      //@ts-ignore
                      ?.execute(tokenFromTransform, tokenDataToTransform);
                  } else {
                    ANIMATIONS.animationFunctions[animation].fn(tokenFromTransform, tokenDataToTransform);
                  }
                  await this.wait(ANIMATIONS.animationFunctions[animation].time);
                }
                //@ts-ignore
                await this.actor.transformInto(
                  // await this._transformIntoCustom(
                  sourceActor,
                  rememberOptions(html),
                );
                if (game.settings.get(CONSTANTS.MODULE_NAME, 'autoclose')) {
                  this.close();
                } else {
                  this.maximize();
                }
              },
            },
            wildshape: {
              icon: '<i class="fas fa-paw"></i>',
              label: i18n('DND5E.PolymorphWildShape'),
              callback: async (html) => {
                if (tokenFromTransform) {
                  if (typeof ANIMATIONS.animationFunctions[animation].fn == 'string') {
                    game.macros
                      ?.getName(ANIMATIONS.animationFunctions[animation].fn)
                      //@ts-ignore
                      ?.execute(tokenFromTransform, tokenDataToTransform);
                  } else {
                    ANIMATIONS.animationFunctions[animation].fn(tokenFromTransform, tokenDataToTransform);
                  }
                  await this.wait(ANIMATIONS.animationFunctions[animation].time);
                }
                //@ts-ignore
                await this.actor.transformInto(
                  // await this._transformIntoCustom(
                  sourceActor,
                  {
                    keepBio: true,
                    keepClass: true,
                    keepMental: true,
                    mergeSaves: true,
                    mergeSkills: true,
                    transformTokens: rememberOptions(html).transformTokens,
                  },
                );
                if (game.settings.get(CONSTANTS.MODULE_NAME, 'autoclose')) {
                  this.close();
                } else {
                  this.maximize();
                }
              },
            },
            polymorph: {
              icon: '<i class="fas fa-pastafarianism"></i>',
              label: i18n('DND5E.Polymorph'),
              callback: async (html) => {
                if (tokenFromTransform) {
                  if (typeof ANIMATIONS.animationFunctions[animation].fn == 'string') {
                    game.macros
                      ?.getName(ANIMATIONS.animationFunctions[animation].fn)
                      //@ts-ignore
                      ?.execute(tokenFromTransform, tokenDataToTransform);
                  } else {
                    ANIMATIONS.animationFunctions[animation].fn(tokenFromTransform, tokenDataToTransform);
                  }
                  await this.wait(ANIMATIONS.animationFunctions[animation].time);
                }
                //@ts-ignore
                await this.actor.transformInto(
                  // await this._transformIntoCustom(
                  sourceActor,
                  {
                    transformTokens: rememberOptions(html).transformTokens,
                  },
                );
                if (game.settings.get(CONSTANTS.MODULE_NAME, 'autoclose')) {
                  this.close();
                } else {
                  this.maximize();
                }
              },
            },
            cancel: {
              icon: '<i class="fas fa-times"></i>',
              label: i18n('Cancel'),
            },
          },
        },
        {
          classes: ['dialog', 'dnd5e'],
          width: 600,
          template: 'systems/dnd5e/templates/apps/polymorph-prompt.html',
        },
      ).render(true);
    } else {
      // ===========================================
      // If system is not dnd5e we can use warpgate
      // ===========================================
      if (typeof ANIMATIONS.animationFunctions[animation].fn == 'string') {
        game.macros
          ?.getName(ANIMATIONS.animationFunctions[animation].fn)
          //@ts-ignore
          ?.execute(tokenFromTransform, tokenDataToTransform);
      } else {
        ANIMATIONS.animationFunctions[animation].fn(tokenFromTransform, tokenDataToTransform);
      }
      await this.wait(ANIMATIONS.animationFunctions[animation].time);

      //get custom data macro
      /* DO NOT NEED THESE
      const customTokenData = await game.macros?.getName(`AP_Polymorpher_Macro(${actor.data.name})`)?.execute({
        //@ts-ignore
        polymorpherActor: actor,
        // spellLevel: this.spellLevel || 0,
        // duplicates: duplicates,
        assignedActor: this.actor || game.user?.character || _token?.actor,
      });
      */
      // log("Automated Polymorpher", {
      //   assignedActor: this.caster || game.user?.character || _token?.actor,
      //   spellLevel: this.spellLevel || 0,
      //   duplicates: duplicates,
      //   warpgateData: customTokenData || {},
      //   summon: actor,
      //  tokenData: tokenData,
      //  posData: posData,
      // })

      // Prepare flag for revert ???
      let updatesForRevert: any = {};
      if (!this.actor?.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.UPDATES_FOR_REVERT)) {
        updatesForRevert = {
          tokenData: this.token.data,
          actorData: this.actor.data,
        };
      } else {
        updatesForRevert = this.actor?.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.UPDATES_FOR_REVERT);
      }
      const updates = {
        token: {
          name: tokenDataToTransform.name,
          img: tokenDataToTransform.img,
          scale: tokenDataToTransform.scale,
          data: tokenDataToTransform,
          actor: {
            //   name: actorToTransform.name,
            //   data: actorToTransform.data
            data: {
              flags: {
                'automated-polymorpher': {
                  updatesforrevert: updatesForRevert,
                },
              },
            },
          },
        },
      };
      await this.actor?.setFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.UPDATES_FOR_REVERT, updatesForRevert);

      //async warpgate.mutate(tokenDoc, updates = {}, callbacks = {}, options = {})
      //@ts-ignore
      await warpgate.mutate(
        tokenFromTransform.document,
        updates, // tokenDataToTransform, //{}, //customTokenData || {},
        {},
        {
          name: tokenFromTransform.actor?.id, // User provided name, or identifier, for this particular mutation operation. Used for 'named revert'.
        },
      );

      if (game.settings.get(CONSTANTS.MODULE_NAME, 'autoclose')) this.close();
      else this.maximize();
    }
  }

  async _onRemovePolymorpher(event) {
    Dialog.confirm({
      title: i18n(`${CONSTANTS.MODULE_NAME}.dialogs.polymorpherManager.confirm.title`),
      content: i18n(`${CONSTANTS.MODULE_NAME}.dialogs.polymorpherManager.confirm.content`),
      yes: () => {
        event.currentTarget.parentElement.remove();
        this.saveData();
      },
      no: () => {
        // DO NOTHING
      },
      defaultYes: false,
    });
  }

  async _onOpenSheet(event) {
    const actorId = event.currentTarget.parentElement.dataset.aid;
    const actorFromTransform = game.actors?.get(actorId);
    if (actorFromTransform) {
      actorFromTransform.sheet?.render(true);
    }
  }

  async loadPolymorphers() {
    const data: PolymorpherData[] =
      // this.actor &&
      // (<boolean>this.actor.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.IS_LOCAL) ||
      //   game.settings.get(CONSTANTS.MODULE_NAME, PolymorpherFlags.STORE_ON_ACTOR))
      //   ? <PolymorpherData[]>this.actor.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.POLYMORPHERS) || []
      //   : <PolymorpherData[]>game.user?.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.POLYMORPHERS) || [];
      <PolymorpherData[]>this.actor.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.POLYMORPHERS) || [];
    if (data) {
      for (const polymorpher of data) {
        this.element.find('#polymorpher-list').append(this.generateLi(polymorpher));
      }
    }
  }

  generateLi(data: PolymorpherData) {
    const actorToTransformLi = game.actors?.get(data.id) || game.actors?.getName(data.id);
    if (!actorToTransformLi) {
      return '';
    }

    const isDnd5e = game.system.id === 'dnd5e';

    const restricted = game.settings.get(CONSTANTS.MODULE_NAME, 'restrictOwned');
    if (restricted && !actorToTransformLi.isOwner) return '';
    const $li = $(`
	<li id="polymorpher" class="polymorpher-item" data-aid="${actorToTransformLi.id}" data-aname="${
      actorToTransformLi.name
    }" data-elid="${randomID()}" draggable="true">
		<div class="summon-btn">
			<img class="actor-image" src="${actorToTransformLi.data.img}" alt="">
			<div class="warpgate-btn" id="summon-polymorpher" data-aid="${actorToTransformLi.id}" data-aname="${
      actorToTransformLi.name
    }"></div>
		</div>
    	<span class="actor-name">${actorToTransformLi.data.name}</span>
    	<select class="anim-dropdown">
        	${this.getAnimations(data.animation)}
    	</select>
      ${
        isDnd5e
          ? `<select id="automated-polymorpher.defaultSummonType" class="defaultSummonType" name="defaultSummonType" data-dtype="String" is="ms-dropdown-ap">
            ${this.getDefaultSummonTypes(data.defaultsummontype, data)}
        </select>`
          : ''
      }
		<i id="remove-polymorpher" class="fas fa-trash"></i>
	</li>
	`);
    //    <i id="advanced-params" class="fas fa-edit"></i>
    return $li;
  }

  getAnimations(anim) {
    let animList = '';
    for (const [group, animations] of Object.entries(ANIMATIONS.animations)) {
      const localGroup = i18n(`${CONSTANTS.MODULE_NAME}.groups.${group}`);
      animList += `<optgroup label="${localGroup == `${CONSTANTS.MODULE_NAME}.groups.${group}` ? group : localGroup}">`;
      for (const a of <any[]>animations) {
        animList += `<option value="${a.key}" ${a.key == anim ? 'selected' : ''}>${a.name}</option>`;
      }
      animList += '</optgroup>';
    }
    return animList;
  }

  getDefaultSummonTypes(defaultsummontype: string, a: PolymorpherData) {
    let animList = '';
    const typesArray = ['', 'DND5E.PolymorphWildShape', 'DND5E.Polymorph'];
    for (const [index, type] of Object.entries(typesArray)) {
      animList += `<option value="${type}" ${a.defaultsummontype === type ? 'selected' : ''}>${i18n(type)}</option>`;
    }
    return animList;
  }

  async wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async saveData() {
    const data: PolymorpherData[] = [];
    for (const polymorpher of this.element.find('.polymorpher-item')) {
      data.push({
        id: <string>polymorpher.dataset.aid,
        name: <string>polymorpher.dataset.aname,
        animation: <string>$(polymorpher).find('.anim-dropdown').val(),
        number: <number>$(polymorpher).find('#polymorpher-number-val').val(),
        defaultsummontype: <string>$(polymorpher).find('.defaultSummonType').val(),
      });
    }

    const isOrdered = <string>this.element.parent().find('.polymorpher-ordered').val() === 'true' ?? false;
    const isRandom = <string>this.element.parent().find('.polymorpher-random').val() === 'true' ?? false;

    if (isRandom && isOrdered) {
      warn(`Attention you can't enable the 'ordered' and the 'random' both at the same time`);
    }

    // this.actor &&
    // (this.actor.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.IS_LOCAL) ||
    //   game.settings.get(CONSTANTS.MODULE_NAME, PolymorpherFlags.STORE_ON_ACTOR))
    //   ? this.actor.setFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.POLYMORPHERS, data)
    //   : game.user?.setFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.POLYMORPHERS, data);
    this.actor.setFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.POLYMORPHERS, data);

    this.actor.setFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.RANDOM, isRandom);
    this.actor.setFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.ORDERED, isOrdered);
  }

  //@ts-ignore
  close(noSave = false) {
    if (!noSave) this.saveData();
    super.close();
  }

  _updateObject(event): any {
    // DO NOTHING
  }

  async fastSummonPolymorpher(
    polymorpherData: PolymorpherData,
    animationExternal = { sequence: undefined, timeToWait: 0 },
  ) {
    this.minimize();

    const actorToTransform = <Actor>game.actors?.get(polymorpherData.id);
    const animation = polymorpherData.animation;
    if (!actorToTransform) {
      warn(
        `The actor you try to polymorphism not exists anymore, please set up again the actor on the polymorpher manager`,
        true,
      );
      return;
    }
    const tokenDataToTransform = <TokenData>await actorToTransform.getTokenData();

    let tokenFromTransform = <Token>canvas.tokens?.placeables.find((t: Token) => {
        return t.actor?.id === this.actor.id;
      }) || undefined;
    if (this.token) {
      tokenFromTransform = this.token;
    }
    // Get the target actor
    const sourceActor = actorToTransform;
    if (!sourceActor) {
      return;
    }
    if (game.system.id === 'dnd5e') {
      const canPolymorph = game.user?.isGM || (this.actor.isOwner && game.settings.get('dnd5e', 'allowPolymorphing'));
      if (!canPolymorph) {
        warn(`You mus enable the setting 'allowPolymorphing' for the dnd5e system`, true);
        return false;
      }
      // // Define a function to record polymorph settings for future use
      // const rememberOptions = (html) => {
      //   const options = {};
      //   html.find('input').each((i, el) => {
      //     options[el.name] = el.checked;
      //   });
      //   const settings = mergeObject(<any>game.settings.get('dnd5e', 'polymorphSettings') || {}, options);
      //   game.settings.set('dnd5e', 'polymorphSettings', settings);
      //   return settings;
      // };

      // Prepare flag for revert ???
      let updatesForRevert: any = {};
      if (!this.actor?.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.UPDATES_FOR_REVERT)) {
        updatesForRevert = {
          tokenData: this.token.data,
          actorData: this.actor.data,
        };
      } else {
        updatesForRevert = this.actor?.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.UPDATES_FOR_REVERT);
      }
      await this.actor?.setFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.UPDATES_FOR_REVERT, updatesForRevert);

      if (polymorpherData.defaultsummontype === 'DND5E.PolymorphAcceptSettings') {
        if (tokenFromTransform) {
          if (animationExternal && animationExternal.sequence) {
            //@ts-ignore
            await animationExternal.sequence.play();
            await wait(animationExternal.timeToWait);
          } else if (animation) {
            if (typeof ANIMATIONS.animationFunctions[animation].fn == 'string') {
              //@ts-ignore
              game.macros
                ?.getName(ANIMATIONS.animationFunctions[animation].fn)
                //@ts-ignore
                ?.execute({ tokenFromTransform, tokenDataToTransform });
            } else {
              ANIMATIONS.animationFunctions[animation].fn(tokenFromTransform, tokenDataToTransform);
            }
            await this.wait(ANIMATIONS.animationFunctions[animation].time);
          }
        }
        //@ts-ignore
        await this.actor.transformInto(
          // await this._transformIntoCustom(
          sourceActor,
          // rememberOptions(html),
          {
            keepPhysical: false,
            keepMental: false,
            keepSaves: false,
            keepSkills: false,
            mergeSaves: false,
            mergeSkills: false,
            keepClass: false,
            keepFeats: false,
            keepSpells: false,
            keepItems: false,
            keepBio: false,
            keepVision: true,
            transformTokens: true,
          },
        );
      } else if (polymorpherData.defaultsummontype === 'DND5E.PolymorphWildShape') {
        if (tokenFromTransform) {
          if (animationExternal && animationExternal.sequence) {
            //@ts-ignore
            await animationExternal.sequence.play();
            await wait(animationExternal.timeToWait);
          } else if (animation) {
            if (typeof ANIMATIONS.animationFunctions[animation].fn == 'string') {
              //@ts-ignore
              game.macros
                ?.getName(ANIMATIONS.animationFunctions[animation].fn)
                //@ts-ignore
                ?.execute(tokenFromTransform, tokenDataToTransform);
            } else {
              ANIMATIONS.animationFunctions[animation].fn(tokenFromTransform, tokenDataToTransform);
            }
            await this.wait(ANIMATIONS.animationFunctions[animation].time);
          }
        }
        //@ts-ignore
        await this.actor.transformInto(
          // await this._transformIntoCustom(
          sourceActor,
          {
            keepBio: true,
            keepClass: true,
            keepMental: true,
            mergeSaves: true,
            mergeSkills: true,
            transformTokens: true,
          },
        );
      } else if (polymorpherData.defaultsummontype === 'DND5E.Polymorph') {
        if (tokenFromTransform) {
          if (animationExternal && animationExternal.sequence) {
            //@ts-ignore
            await animationExternal.sequence.play();
            await wait(animationExternal.timeToWait);
          } else if (animation) {
            if (typeof ANIMATIONS.animationFunctions[animation].fn == 'string') {
              //@ts-ignore
              game.macros
                ?.getName(ANIMATIONS.animationFunctions[animation].fn)
                //@ts-ignore
                ?.execute(tokenFromTransform, tokenDataToTransform);
            } else {
              ANIMATIONS.animationFunctions[animation].fn(tokenFromTransform, tokenDataToTransform);
            }
            await this.wait(ANIMATIONS.animationFunctions[animation].time);
          }
        }
        //@ts-ignore
        await this.actor.transformInto(
          // await this._transformIntoCustom(
          sourceActor,
          {
            keepPhysical: false,
            keepMental: false,
            keepSaves: false,
            keepSkills: false,
            mergeSaves: false,
            mergeSkills: false,
            keepClass: false,
            keepFeats: false,
            keepSpells: false,
            keepItems: false,
            keepBio: false,
            keepVision: true,
            transformTokens: true,
          },
        );
      } else {
        warn(
          `No default summon type is setted for any polymorphing actor on the list associated to this actor ${actorToTransform.name}`,
          true,
        );
      }
    } else {
      // ===========================================
      // If system is not dnd5e we can use warpgate
      // ===========================================
      if (animationExternal && animationExternal.sequence) {
        //@ts-ignore
        await animationExternal.sequence.play();
        await wait(animationExternal.timeToWait);
      } else if (animation) {
        if (typeof ANIMATIONS.animationFunctions[animation].fn == 'string') {
          //@ts-ignore
          game.macros
            ?.getName(ANIMATIONS.animationFunctions[animation].fn)
            //@ts-ignore
            ?.execute(tokenFromTransform, tokenDataToTransform);
        } else {
          ANIMATIONS.animationFunctions[animation].fn(tokenFromTransform, tokenDataToTransform);
        }
        await this.wait(ANIMATIONS.animationFunctions[animation].time);
      }

      // Prepare flag for revert ???
      let updatesForRevert: any = {};
      if (!this.actor?.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.UPDATES_FOR_REVERT)) {
        updatesForRevert = {
          tokenData: this.token.data,
          actorData: this.actor.data,
        };
      } else {
        updatesForRevert = this.actor?.getFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.UPDATES_FOR_REVERT);
      }
      const updates = {
        token: {
          name: tokenDataToTransform.name,
          img: tokenDataToTransform.img,
          scale: tokenDataToTransform.scale,
          data: tokenDataToTransform,
          actor: {
            //   name: actorToTransform.name,
            //   data: actorToTransform.data
            data: {
              flags: {
                'automated-polymorpher': {
                  updatesforrevert: updatesForRevert,
                },
              },
            },
          },
        },
      };
      await this.actor?.setFlag(CONSTANTS.MODULE_NAME, PolymorpherFlags.UPDATES_FOR_REVERT, updatesForRevert);

      //async warpgate.mutate(tokenDoc, updates = {}, callbacks = {}, options = {})
      //@ts-ignore
      await warpgate.mutate(
        tokenFromTransform.document,
        updates, // tokenDataToTransform, // {}, // customTokenData || {},
        {},
        {
          name: tokenFromTransform.actor?.id, // User provided name, or identifier, for this particular mutation operation. Used for 'named revert'.
        },
      );
    }
  }
}

export class SimplePolymorpherManager extends PolymorpherManager {
  // caster: Actor;
  // summons: any[];
  // spellLevel: number;

  constructor(actor: Actor, token: Token, summonData) {
    super(actor, token, summonData);
    // this.caster = actor;
    // this.summons = summonData;
    // this.spellLevel = spellLevel;
  }

  async activateListeners(html) {
    for (const summon of <any[]>this.summons) {
      this.element.find('#polymorpher-list').append(this.generateLi(summon));
    }

    html.on('click', '#summon-polymorpher', this._onSummonPolymorpher.bind(this));
    html.on('click', '.actor-name', this._onOpenSheet.bind(this));
  }

  _onDrop(event) {
    // DO NOTHING
  }

  close() {
    super.close(true);
  }
}
