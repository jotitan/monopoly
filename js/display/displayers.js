/* Displayers d'information */

import {GestionJoueur} from "../gestion_joueurs.js";

function initWrapButtons(bloc){
    currentDialogId++;
    bloc.data('inner-open-id',currentDialogId);
    // Create specific button for mobile version
    $('#actions').empty();

    let buttons = bloc.dialog('option','buttons');
    for(let buttonName in buttons){
        let buttonDef = buttons[buttonName];

        if(buttonDef.text != null){
            let button = $(`<button>${buttonDef.text}</button>`);
            button.on('click',buttonDef.click);
            $('#actions').append(button);
        }else{
            let button = $(`<button>${buttonName}</button>`);
            button.on('click',buttonDef);
            $('#actions').append(button);
        }
    }
}

let currentDialogId = 0;

function closeActions(event){
    if(currentDialogId !== $(event.currentTarget).data('inner-open-id')){
        return;
    }
    $('#actions').empty();
}

function openWrapDialog(bloc){
    // Detect buttons
    initWrapButtons(bloc);
    // When open bloc, generate id and set in global and in panel. When close, check if same, if not, do not delete actions
    bloc.off("dialogclose.wrapper").on("dialogclose.wrapper",e=>closeActions(e))
    bloc.dialog('open');
}

function wrapDialog(bloc,parameters){
    if(parameters === 'open'){
        return openWrapDialog(bloc);
    }
    bloc.off("dialogopen.wrapper").on("dialogopen.wrapper",()=>initWrapButtons(bloc));

    // Intercept close and clean actions bloc
    bloc.off("dialogclose.wrapper").on("dialogclose.wrapper",e=>closeActions(e));
    bloc.dialog(parameters);
}

/* Affiche les fiches de terrains */
let FicheDisplayer = {
    detailFiche:null,
    detailJunior:null,
    fiche:null,
    ficheJunior:null,
    ficheCompagnie:null,
    currentFiche:null,
    init:function(){
        this.fiche = $('#fiche');
        this.ficheJunior = $('#ficheJunior');
        this.detailFiche = this.fiche.clone();
        this.detailFicheJunior = this.ficheJunior.clone();
        this.detailFiche.attr('id', 'idDetailFiche').addClass('detail-fiche').hide();
        this.detailFicheJunior.attr('id', 'idDetailFicheJunior').addClass('detail-fiche').hide();
        $('body').append(this.detailFiche);
        $('body').append(this.detailFicheJunior);
        this.ficheCompagnie = $('#ficheCompagnie');

        wrapDialog(this.fiche,{
            autoOpen: false,
            title: "Fiche",
            width: 280,
            height: 410,
            modal: true,
            position: { my: "center top", at: "center top", of: window },
            resizable: false,
            close: function () {
                FicheDisplayer.close();
            }
        });
        this.fiche.prev().css("background", "url()");

        wrapDialog(this.ficheJunior,{
            autoOpen: false,
            title: "Fiche",
            width: 280,
            height: 410,
            modal: true,
            position: { my: "center top", at: "center top", of: window },
            resizable: false,
            close: function () {
                FicheDisplayer.close();
            }
        });
        this.ficheJunior.prev().css("background", "url()");

        wrapDialog(this.ficheCompagnie,{
            autoOpen: false,
            title: "Fiche",
            width: 280,
            height: 350,
            modal: true,
            position: { my: "center top", at: "center top", of: window },
            resizable: false,
            close: function () {
                FicheDisplayer.close();
            }
        });
        this.ficheCompagnie.prev().css("background", "url()");
    },
    openDetail:function(fiche,input){
        let detailFiche = fiche.type === "junior" ? this.detailFicheJunior : this.detailFiche;
        if (this.currentFiche != null && this.currentFiche.axe === fiche.axe && this.currentFiche.pos === fiche.pos) {
            if (detailFiche.is(':visible')) {
                return detailFiche.slideUp();
            }
            return detailFiche.slideDown();
        }
        if (this.currentFiche != null && (this.currentFiche.axe !== fiche.axe || this.currentFiche.pos !== fiche.pos)) {
            this.currentFiche = null;
            detailFiche.slideUp(300, function () {
                FicheDisplayer.openDetail(fiche, input);
            });
            return;
        }
        this.loadDetailFiche(fiche,detailFiche);
        input.after(detailFiche);
        detailFiche.slideDown();
        this.currentFiche = fiche;
    },
    close:function(){
        GestionJoueur.change();
    },
    loadFiche:function(fiche){
        this._load(fiche,fiche.type === "junior" ? this.ficheJunior : this.fiche, 'FFFFFF');
        fiche.fiche.panel.prev().css("background-color", fiche.color);
    },
    loadDetailFiche:function(fiche,detailFiche){
        this._load(fiche, detailFiche, fiche.secondColor);
    },
    _load:function(fiche,div,color){
        $('td[name^="loyer"]', div).each(function () {
            $(this).text(fiche.loyer[parseInt($(this).attr('name').substring(5))]);
        });
        $('td[name]:not([name^="loyer"]),span[name]:not([name^="loyer"])', div).each(function () {
            $(this).html(fiche[$(this).attr('name')]);
        });
        $(div).css('backgroundColor', color);

        // Cas des gare
        if(fiche.type === 'gare'){
            $('.loyer0', div).text(parseInt(fiche.getLoyer()));
        }
        else{
            $('.loyer0', div).text((fiche.isGroupee() === true) ? parseInt(fiche.loyer[0]) * 2 : fiche.loyer[0]);
        }

        $('tr', div).removeClass("nbMaisons");
        $('.infos-group', div).removeClass("nbMaisons");
        $('.loyer' + fiche.nbMaison, div).parent().addClass("nbMaisons");
        if (fiche.nbMaison === 0 && fiche.isGroupee() === true) { // possede la serie
            $('.infos-group', div).addClass("nbMaisons");
        }
        if (fiche.type === 'gare') {
            $('.maison', div).hide();
        } else {
            $('.maison', div).show();
        }
    },
    closeFiche:function(){
        var close = false;
        if(this.fiche.dialog('isOpen')) {
            this.fiche.dialog('close');
            close = true;
        }
        if (this.ficheCompagnie.dialog('isOpen')) {
            this.ficheCompagnie.dialog('close');
            close = true;
        }
        if (this.ficheJunior.dialog('isOpen')) {
            this.ficheJunior.dialog('close');
            close = true;
        }
        if(!close) {
            this.close();
        }
    }
}

/* Affiche les ecrans de communication lors d'echange */
let CommunicationDisplayer = {
    panel: null,
    joueur: null, // Joueur a qui est affiche le panneau
    init: function (idPanel) {
        this.panel = $('#' + idPanel);
        //this.panel.dialog({
        wrapDialog(this.panel,{
            autoOpen: false,
            title: 'Echange',
            width: 400,
            position: { my: "center top", at: "center top", of: window }
        });
    },
    /* Affiche la demande (recapitulatif). On affiche les options si on recoit la demande */
    show: function (demandeur, proprietaire, terrain, proposition, displayJoueur) {
        this.showPropose(demandeur, proprietaire, terrain, proposition, displayJoueur);
        // On ajoute les actions
        this.addMessage("Que souhaitez vous faire", [{
            nom: "Accepter",
            action: function () {
                CommunicationDisplayer.close();
                GestionEchange.accept(CommunicationDisplayer.joueur);
            }
        }, {
            nom: "Refuser",
            action: function () {
                CommunicationDisplayer.close();
                GestionEchange.reject(CommunicationDisplayer.joueur);
            }
        }, {
            nom: "Négocier",
            action: function () {
                CommunicationDisplayer._showContrePanel(demandeur);
            }
        }], true)

    },
    /* Affiche juste la proposition, pas d'option */
    showPropose: function (demandeur, proprietaire, terrain, proposition, displayJoueur) {
        this.joueur = displayJoueur;
        this.panel.dialog('option', 'title', 'Echange entre ' + demandeur.nom + ' et ' + proprietaire.nom);
        $('.proposition,.communications', this.panel).empty();
        $('.proposition', this.panel).append('<div>Terrain : <span style="font-weight:bold;color:' + terrain.color + '">' + terrain.nom + '</div>');

        this._showProposition($('.proposition', this.panel), proposition);
        $('.communications', this.panel).empty();
    },
    /* Affiche le panneau de saisie d'une contreproposition */
    _showContrePanel: function (joueur, joueurAdverse) {
        // Affichage sur l'ecran principal ou le meme
        var groups = joueur.maisons.getMaisonsGrouped();
        var divProposition = $('<div class="contreProposition"></div>');
        for (var g in groups) {
            // ne pas affiche si construit )groups[g].isConstructed()
            var group = groups[g];
            var div = $('<div style="font-weight:bold;color:' + group.color + '">Groupe ' + group.groupe + '<br/></div>');
            for (var f in group.terrains) {
                var fiche = group.terrains[f];
                div.append('<input type="checkbox" value="' + fiche.id + '" id="chk_id_' + fiche.id + '"/><label for="chk_id_' + fiche.id + '">' + fiche.nom + '</label><br/>');
            }
            divProposition.append(div);
        }
        divProposition.append('Argent : <input class="argent" type="text"/>');
        $('.communications', this.panel).append(divProposition);
        this.addMessage("Quelle est votre contreproposition", [{
            nom: "Proposer",
            action: function () {
                CommunicationDisplayer._doContreproposition(CommunicationDisplayer.joueur);
            }
        }, {
            nom: "Rejeter",
            action: function () {
                CommunicationDisplayer.close();
                GestionEchange.reject(CommunicationDisplayer.joueur);
            }
        }], true)
    },
    _doContreproposition: function (joueur) {
        // On recupere les informations
        var proposition = {
            terrains: [],
            compensation: 0
        };
        $('.contreProposition:last :checkbox:checked', this.panel).each(function () {
            var terrain = GestionFiche.getById($(this).val());
            if (terrain != null) {
                proposition.terrains.push(terrain);
            }
        });
        var argent = $('.contreProposition:last :text.argent', this.panel).val();
        if (argent != "") {
            proposition.compensation = parseInt(argent);
        }
        GestionEchange.contrePropose(proposition, joueur);
    },
    _showProposition: function (div, proposition) {
        div.append('Proposition : ');
        if (proposition.terrains.length > 0) {
            for (var t in proposition.terrains) {
                var terrain = proposition.terrains[t];
                div.append('<div style="padding-left:20px;color:' + terrain.color + '">' + terrain.nom + '</div>');
            }
        }
        div.append('<div style="padding-left:20px;">Argent : ' + CURRENCY + ' ' + proposition.compensation + '</div>');
    },
    /* Affiche la proposition acceptee */
    showAccept: function (callback) {
        this.addMessage("La proposition a été <span style=\"color:green\">acceptée</span>", [{
            nom: "Fermer",
            action: function () {
                CommunicationDisplayer.close();
                if (callback) {
                    callback();
                }
            }
        }]);
    },
    showReject: function (callback) {
        this.addMessage("La proposition a été <span style=\"color:red\">rejetée</span>.", [{
            nom: "Fermer",
            action: function () {
                CommunicationDisplayer.close();
                if (callback) {
                    callback();
                }
            }
        }]);
    },
    showContreProposition: function (contreProposition) {
        this.addMessage("Une contreproposition a été faite", [{
            nom: "Refuser",
            action: function () {
                CommunicationDisplayer.close();
                GestionEchange.reject(CommunicationDisplayer.joueur);
            }
        }, {
            nom: "Accepter",
            action: function () {
                CommunicationDisplayer.close();
                GestionEchange.accept(CommunicationDisplayer.joueur);
            }
        }]);
        this._showProposition($('.communications', this.panel), contreProposition);
    },
    /* @param actions : beaucoup d'action a proposer au joueur */
    addMessage: function (message, actions, noHr) {
        if (!noHr) {
            $('.communications', this.panel).append('<hr/>');
        }
        $('.communications', this.panel).append('<p>' + message + '</p>');
        if (actions != null && actions.length > 0) {
            var buttons = [];
            for (var act in actions) {
                var action = actions[act];
                var button = {
                    text: action.nom,
                    click: action.action
                };
                buttons.push(button)
            }
            this.panel.dialog('option', 'buttons', buttons);
            this.open();
        }
    },
    close: function () {
        this.panel.dialog('close');
    },
    open: function () {
        wrapDialog(this.panel,'open');
        //this.panel.dialog('open');
    }
}

export {wrapDialog,CommunicationDisplayer,FicheDisplayer};