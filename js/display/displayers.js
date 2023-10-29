/* Displayers d'information */

import {GestionJoueur} from "../core/gestion_joueurs.js";
import {CURRENCY} from "../core/monopoly.js";
import {GestionEchange} from "../core/enchere.js";
import {GestionFiche} from "./case_jeu.js";

class Dialog {
    open(element, {title = '', buttons = {}, width, height, colorTitle='', colorButtons=''}) {
        this.current = element;
        element.style.setProperty("display", "");

        const wrapper = document.querySelector('#idMessagePanel');

        wrapper.style.setProperty('display', 'block');
        const titleDiv = wrapper.querySelector('.title-panel');
        titleDiv.textContent = title;
        if(title === ''){
            titleDiv.style.setProperty('display','none');
        }else {
            titleDiv.style.setProperty('background-color', colorTitle);
            titleDiv.style.setProperty('display','');
        }
        this.setSize(wrapper, width, height);

        const buttonsDiv = wrapper.querySelector('.buttons');
        buttonsDiv.before(element);
        buttonsDiv.style.setProperty('background-color',colorButtons);
        Object.entries(buttons).map(createButton).forEach(button => buttonsDiv.append(button))

        document.querySelector('body').append(wrapper);
    }
    clearButtons(){
        this.updateButtons({});
    }
    updateButtons(buttons){
        const buttonsDiv = document.getElementById('idMessagePanel').querySelector('.buttons');
        buttonsDiv.innerHTML = '';
        Object.entries(buttons).map(createButton).forEach(button => buttonsDiv.append(button))
    }

    close(callback = ()=>{}) {
        if (this.current == null) {
            callback();
            return false;
        }
        this.current.style.setProperty('display', 'none');
        document.querySelector('body').append(this.current);
        const wrapper = document.querySelector('#idMessagePanel');
        wrapper.style.setProperty('display', 'none');
        wrapper.querySelector('.buttons').textContent = '';

        this.current = null;
        callback();
        return true;
    }

    setSize(wrapper, width, height) {
        const panelWrapper = wrapper.querySelector('.wrapper-panel');
        panelWrapper.style.setProperty("width", `${width}px`);
        panelWrapper.style.setProperty("height", `${height}px`);
        panelWrapper.style.setProperty("left", `calc(50% - ${width / 2}px)`);
    }

    updateTitle(title) {
        const wrapper = document.querySelector('#idMessagePanel');
        const titleDiv = wrapper.querySelector('.title-panel');
        titleDiv.textContent = title;
    }
}

const dialog = new Dialog();

function createButton([title, action]) {
    const button = document.createElement('button');
    button.textContent = title;
    button.onclick = action
    return button;
}

/* Affiche les fiches de terrains */
const FicheDisplayer = {
    detailFiche: null,
    detailJunior: null,
    detailFicheCompagnie: null,
    fiche: null,
    ficheJunior: null,
    currentFiche: null,
    init: function () {
        this.fiche = document.querySelector('#fiche');
        this.ficheJunior = document.querySelector('#ficheJunior');

        this.detailFiche = this._cloneFiche(this.fiche, 'idDetailFiche');
        this.detailFicheJunior = this._cloneFiche(this.ficheJunior, 'idDetailFicheJunior');
        this.detailFicheCompagnie = this._cloneFiche(document.querySelector('#ficheCompagnie'), 'ficheCompagnie');
    },
    _cloneFiche(fiche, id){
        const detail = fiche.cloneNode(true);
        detail.id = id;
        detail.classList.add('detail-fiche');
        detail.style.setProperty("display","none");
        document.querySelector('body').append(detail);
        return detail;
    },
    openDetail: function (fiche, input) {
        let detailFiche = fiche.type === 'compagnie' ? this.detailFicheCompagnie : fiche.type === "junior" ? this.detailFicheJunior : this.detailFiche;
        if (this.currentFiche != null && this.currentFiche.axe === fiche.axe && this.currentFiche.pos === fiche.pos) {
            if(detailFiche.style.display === 'none'){
                return detailFiche.style.setProperty('display','block');
            }
            return detailFiche.style.setProperty('display','none');
        }
        if (this.currentFiche != null && (this.currentFiche.axe !== fiche.axe || this.currentFiche.pos !== fiche.pos)) {
            this.currentFiche = null;
            detailFiche.style.setProperty('display','none');
            document.querySelector('body').insertAdjacentHTML('afterend',detailFiche);
            return this.openDetail(fiche, input)
        }
        input.after(detailFiche);
        this.loadDetailFiche(fiche, detailFiche);
        detailFiche.style.setProperty('display','block');
        this.currentFiche = fiche;
    },
    close: function () {
        GestionJoueur.change();
    },
    loadFiche: function (fiche) {
        this._load(fiche, fiche.type === "junior" ? this.ficheJunior : this.fiche, fiche.secondColor);
    },
    loadDetailFiche: function (fiche, detailFiche) {
        this._load(fiche, detailFiche, fiche.secondColor);
    },
    _name: function (e) {
        return e.getAttribute("class");
    },
    _load: function (fiche, div, color) {
        div.style.setProperty('background-color', color);
        div.querySelectorAll(`td[class^="loyer"]`).forEach(d => d.innerHTML = fiche.loyer[parseInt(this._name(d).substring(5))]);
        div.querySelectorAll(`td[class]:not([class^="loyer"]), span[class]:not([class^="loyer"])`).forEach(d => d.innerHTML = fiche[this._name(d)]);
        div.querySelectorAll(`.loyer0`).forEach(d=>d.innerHTML = fiche.type === 'gare' ? fiche.getLoyer() : fiche.isGrouped() === true ? parseInt(fiche.loyer[0]) * 2 : fiche.loyer[0]);
        div.querySelectorAll(`tr, .infos-group`).forEach(d => d.classList.remove("nbMaisons"));
        div.querySelectorAll(`.loyer${fiche.nbMaison}`).forEach(d=>d.parentElement.classList.add("nbMaisons"));
        if (fiche.nbMaison === 0 && fiche.isGrouped() === true) { // possede la serie
            div.querySelector(`.infos-group`).classList.add("nbMaisons");
        }
        div.querySelectorAll(`.maison`).forEach(d => d.style.setProperty("display", fiche.type === 'gare' ? "none" : ""));
    },
    closeFiche: function () {
        dialog.close();
        this.close();
    }
}

/* Affiche les ecrans de communication lors d'echange */
let CommunicationDisplayer = {
    panel: null,
    joueur: null, // Joueur a qui est affiche le panneau
    init: function (idPanel) {
        this.panel = document.getElementById(idPanel);
    },
    /* Affiche la demande (recapitulatif). On affiche les options si on recoit la demande */
    show: function (demandeur, proprietaire, terrain, proposition, displayJoueur) {
        this.showPropose(demandeur, proprietaire, terrain, proposition, displayJoueur);
        // On ajoute les actions
        this.addMessage("Que souhaitez vous faire", [{
            nom: "Accepter",
            action: () => {
                CommunicationDisplayer.close();
                GestionEchange.accept(CommunicationDisplayer.joueur);
            }
        }, {
            nom: "Refuser",
            action: () => {
                CommunicationDisplayer.close();
                GestionEchange.reject(CommunicationDisplayer.joueur);
            }
        }, {
            nom: "Négocier",
            action: ()=>CommunicationDisplayer._showContrePanel(demandeur)
        }], true)
    },
    /* Affiche juste la proposition, pas d'option */
    showPropose: function (demandeur, proprietaire, terrain, proposition, displayJoueur) {
        this.joueur = displayJoueur;
        this.demandeur = demandeur;
        dialog.updateTitle(`Echange entre ${demandeur.nom} et ${proprietaire.nom}`)
        this.panel.querySelectorAll('.proposition,.communications').forEach(d=>d.innerHTML='');
        this.panel.querySelector('.proposition').insertAdjacentHTML('beforeend',`<div>Terrain : <span style="font-weight:bold;color:${terrain.color}">${terrain.nom}</div>`);
        this._showProposition(this.panel.querySelector('.proposition'), proposition);
        //this.panel.querySelector('.communications').innerHTML='';
    },
    showNativeTerrainByGroup(bloc, joueur) {
        Object.values(joueur.maisons.getMaisonsGrouped()).forEach(group=>{
            const div = document.createElement('div');
            div.classList.add('group-propriete');
            div.style.setProperty('color',group.color);
            div.insertAdjacentHTML('beforeend',`<div>Groupe ${group.groupe}</div>`)
            group.terrains.forEach(fiche=>div.insertAdjacentHTML('beforeend',`<input type="checkbox" value="${fiche.id}" id="chk_id_${fiche.id}"/><label for="chk_id_${fiche.id}">${fiche.nom}</label><br/>`))
            bloc.append(div);
        });
    },
    /* Affiche le panneau de saisie d'une contreproposition */
    _showContrePanel: function (joueur, joueurAdverse) {
        const divProposition = document.createElement('div');
        divProposition.classList.add('contreProposition');
        this.showNativeTerrainByGroup(divProposition, joueur);
        // Affichage sur l'ecran principal ou le meme
        divProposition.insertAdjacentHTML('beforeend','Argent : <input class="argent" type="text"/>')
        this.panel.querySelector('.communications').append(divProposition);
        this.addMessage("Quelle est votre contreproposition ?", [{
            nom: "Proposer",
            action: () => CommunicationDisplayer._doContreproposition(CommunicationDisplayer.joueur)
        }, {
            nom: "Rejeter",
            action: () => {
                CommunicationDisplayer.close();
                GestionEchange.reject(CommunicationDisplayer.joueur);
            }
        }], true)
    },
    _doContreproposition: function (joueur) {
        // On recupere les informations
        let proposition = {
            terrains: [],
            compensation: 0
        };
        this.panel.querySelectorAll('.contreProposition :checked').forEach(input=>{
            let terrain = GestionFiche.getById(input.value);
            if (terrain != null) {
                proposition.terrains.push(terrain);
            }
        });
        proposition.compensation = parseInt(document.querySelector('.contreProposition input[type="text"].argent').value) || 0;
        GestionEchange.contrePropose(proposition, joueur);
    },
    _showProposition: (div, proposition) => {
        div.append(document.createTextNode('Proposition : '));
        if (proposition.terrains.length > 0) {
            for (let t in proposition.terrains) {
                let terrain = proposition.terrains[t];
                div.insertAdjacentHTML('beforeend',`<div style="padding-left:20px;color:${terrain.color}">${terrain.nom}</div>`);
            }
        }
        div.insertAdjacentHTML('beforeend',`<div style="padding-left:20px;">Argent : ${CURRENCY} ${proposition.compensation}</div>`);
    },
    /* Affiche la proposition acceptee */
    showAccept: function(callback = () => {}) {
        this.addMessage('La proposition a été <span style="color:green">acceptée</span>', [{
            nom: "Fermer",
            action: () => {
                CommunicationDisplayer.close();
                callback();
            }
        }]);
    },
    showReject: function(callback = () => {}) {
        this.addMessage('La proposition a été <span style="color:red">rejetée</span>.', [{
            nom: "Fermer",
            action: () => {
                CommunicationDisplayer.close();
                callback();
            }
        }]);
    },
    showContreProposition: function(contreProposition){
        this.addMessage("Une contreproposition a été faite", [{
            nom: "Refuser",
            action: () => {
                CommunicationDisplayer.close();
                GestionEchange.reject(CommunicationDisplayer.joueur);
            }
        }, {
            nom: "Accepter",
            action: () => {
                CommunicationDisplayer.close();
                GestionEchange.accept(CommunicationDisplayer.joueur);
            }
        }]);
        this._showProposition(this.panel.querySelector('.communications'), contreProposition);
    },
    /* @param actions : beaucoup d'action a proposer au joueur */
    addMessage: function (message, actions, noHr) {
        if (!noHr) {
            this.panel.querySelector('.communications').append(document.createElement('hr'));
        }
        this.panel.querySelector('.communications').insertAdjacentHTML('beforeend',`<p style="font-weight: bold">${message}</p>`);
        if (actions != null && actions.length > 0) {
            let buttons = [];
            actions.forEach(action => buttons[action.nom] = action.action);
            dialog.updateButtons(buttons);
            this.open();
        }
    },
    close: function () {
        dialog.close();
    },
    open: function () {
        dialog.open(this.panel,{title:`Echange de terrain par ${this.demandeur.nom}`,height:507,width:400})
    }
};

export {dialog, CommunicationDisplayer, FicheDisplayer};
