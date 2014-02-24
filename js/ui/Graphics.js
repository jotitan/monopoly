/* Fournit les methodes de dessin d'un plateau de jeu standard (carré) */

var CURRENT_ID_COMPONENT = 0; // Permet de generer un numero de composant unique

/* Fournit des methodes de dessins */
var DrawerHelper = {
	fromDegresToRad:function(angle){
		return (angle/180)*Math.PI;
	},
	drawCircle:function(canvas,color,rayon,center){
		canvas.fillStyle=color;
		canvas.beginPath();
		canvas.arc(center.x,center.y,rayon,0,2*Math.PI);
		canvas.fill();
		canvas.closePath();
	},
	drawArcCircle:function(canvas,color,rayon,center,alphaStart,alphaEnd){
		canvas.beginPath();
		canvas.fillStyle = color;
		canvas.moveTo(center.x,center.y);
		canvas.arc(center.x,center.y,rayon,alphaStart,alphaEnd);
		canvas.fill();
		canvas.closePath();	
	},
    drawImage: function (canvas, img, x, y, width, height, rotate) {
		canvas.save();
		canvas.translate(x, y);
		canvas.rotate(rotate);
		try{
			canvas.drawImage(img, 0, 0, width, height);
		}catch(e){}
		canvas.restore();
    },
    /* @param align : si null, center, sinon 'left' ou 'right' */
    writeText: function (text, x, y, rotate, canvas, size, specificWidth, align) {
        var width = specificWidth || largeur;
		canvas.strokeStyle='#000000';
        canvas.font = ((size != null) ? size : "7") + "pt Times news roman";
        // Mesure la longueur du mot
        var mots = [text];
        if (canvas.measureText(text).width > width - 5) {
            // On split les mots intelligement (on regroupe)
            var splitMots = text.split(" ");
            var pos = 0;
            for (var i = 0; i < splitMots.length; i++) {
                if (pos > 0 && (canvas.measureText(mots[pos - 1]).width + canvas.measureText(splitMots[i]).width) < width - 5) {
                    // on concatene
                    mots[pos - 1] = mots[pos - 1] + " " + splitMots[i];
                } else {
                    mots[pos++] = splitMots[i];
                }
            }
        }
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(rotate);
        var pas = 12;
        for (var i = 0; i < mots.length; i++) {
            var lng;
            switch(align){
            	case 'left':lng=0;break;
            	case 'right':lng = width - canvas.measureText(mots[i]).width;break;
            	default : lng = (width - canvas.measureText(mots[i]).width) / 2;
            }
			canvas.strokeText(mots[i], lng, i * pas);
        }
        canvas.font = "6pt Times news roman";
        canvas.restore();
    }
}

/* Tout objet graphique etant de component */
function Component() {
	// Genere un id unique
	this.id = CURRENT_ID_COMPONENT++;
	this.draw = function (canvas) {
		console.log("Not implemented");
	}
}


/* En fonction du type de plateau (square, circle), fournit les objets permettant de le construire */
/* Renvoie uniquement des components (implemente draw) */
var DrawerFactory = {
	instances:[],
	type:null,
	infos:{},	// Infos communes

	init:function(){
		return this;
	},
	/* Configure la factory */
	setType:function(type){
		this.type = type;
	},
	addInfo:function(name,info){
		this.infos[name] = info;
	},
	/* Ajoute une nouvelle implementation */
	/* A implementer : type, standardCase, specialCase */
	addInstance:function(instance){
		this.instances[instance.type] = instance;		
	},	
	getDes:function(x, y, width){
		return this._instantiate('des',arguments);		
	},
	getCase:function(pos,axe,color,nom,prix,img){
		return this._instantiate('standardCase',arguments);	
	},
	getCaseSpeciale:function(axe,titre){
		return this._instantiate('specialCase',arguments);	
	},
	getPionJoueur:function(color){
		return this._instantiate('pionJoueur',arguments);	
	},
	getPlateau:function(x,y,width,height,color){
		return this._instantiate('plateau',arguments);	
	},
	endPlateau:function(){
		return this._instantiate('endPlateau',arguments);		
	},
	_instantiate:function(method,params){
		if(this.instances[this.type] == null){
			throw "Creation, type : " + this.type + " inconnu";    
		}
		if(this.instances[this.type][method] == null){
			return null;
		}
		var o = {};
		this.instances[this.type][method].apply(o,params);
		return o;
	}
}.init();

// Gere les dessins
var Drawer = {
    components: new Array(),	// Un ordre est ajoute lors de l'insertion
    height: 0,
    width: 0,
    interval: null,
    intervalRT: null,
    canvas: null,
    intervals: [], // Stocke les flags d'arret du refresh
    canvasRT: null, //Canvas de temps reel
    // ajoute un composant. On indique le canvas sur lequel il s'affiche
	/* @param order : Si present, indique l'ordre d'affichage. Le plus petit en premier */
    add: function (component, order) {
		if(component == null){return;}
        component.getId = function () {
            return Drawer.canvas.canvas.id
        };
		component.order = (order==null)?0:order;
        Drawer.components.push(component);        
    },
    addRealTime: function (component) {
        component.getId = function () {
            return Drawer.canvasRT.canvas.id
        };
        Drawer.components.push(component);
    },
    removeComponent: function (component) {
        // Boucle sur les composants et supprime si l'id est le meme
        for (var i = 0; i < this.components.length; i++) {
            if (this.components[i].id == component.id) {
                this.components.splice(i, 1);
                return;
            }
        }
    },
    clear: function (canvas) {
        canvas.clearRect(0, 0, this.width, this.height);
    },
    /* Rafraichit un seul canvas */
    refresh: function (canvas) {
        Drawer.clear(canvas);
        for (var i = 0; i < Drawer.components.length; i++) {
            if (Drawer.components[i].getId() === canvas.canvas.id) {
				Drawer.components[i].draw(canvas);
            }
        }
    },
    // Refraichissement du graphique, time en ms
    setFrequency: function (time, canvas) {
        if (Drawer.intervals[canvas.canvas.id] != null) {
            clearInterval(Drawer.intervals[canvas.canvas.id]);
        }
        Drawer.intervals[canvas.canvas.id] = setInterval(function () {
            Drawer.refresh(canvas);
        }, time);
    },
    init: function (width, height) {
		// On tri les composants qui ont ete ajoutes
		this.components.sort(function(a,b){
			return a.order - b.order;
		});
        this.width = width;
        this.height = height;
        this.canvas = document.getElementById("canvas").getContext("2d");
        this.canvasRT = document.getElementById("canvas_rt").getContext("2d");
        this.canvas.strokeStyle = '#AA0000';
        this.canvasRT.strokeStyle = '#AA0000';
        // On ne recharge pas le plateau, il n'est charge qu'une seule fois (ou rechargement a la main)
        this.refresh(this.canvas);
        this.setFrequency(50, this.canvasRT);

        $.bind('refreshPlateau', function () {
            Drawer.refresh(Drawer.canvas);
        });
        return this;
    }
};

