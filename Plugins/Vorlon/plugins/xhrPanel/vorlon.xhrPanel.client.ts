module VORLON {

    export class XHRPanelClient extends ClientPlugin {
        public hooked: boolean = false;
        public cache: Array<NetworkEntry> = [];
        private _previousOpen;
        private _previousSetRequestHeader;
        private _xhrSource;
        private _fetch;
        private _hookAlreadyDone;

        constructor() {
            super("xhrPanel");
            this._id = "XHRPANEL";
            this._ready = false;        
        }
            
        public refresh(): void {
            this.sendStateToDashboard();
            this.sendCacheToDashboard();
        }

        public sendStateToDashboard() {
            this.sendCommandToDashboard('state', { hooked: this.hooked });
        }

        public sendCacheToDashboard() {
            for (var i = 0, l = this.cache.length; i < l; i++) {
                this.sendCommandToDashboard('xhr', this.cache[i]);
            }
        }

        public clearClientCache() {
            this.cache = [];
        }

        // This code will run on the client //////////////////////

        public startClientSide(): void {
            this._ready = true;
            //this.setupXMLHttpRequestHook();
        }

        public onRealtimeMessageReceivedFromDashboardSide(receivedObject: any): void {            
        }

        private _hookPrototype(that, xhrSource) {
            var data = {
                id: VORLON.Tools.CreateGUID(),
                url: null,
                status : null,
                statusText : null,
                method: null,
                responseType: null,
                responseHeaders : null,
                requestHeaders : [],
                readyState: 0,
                response: null,
                responseText: null,
                responseXML: null,
            }
            this.cache.push(data);
            
            if(!this._previousOpen){ 
                this._previousOpen = xhrSource.prototype.open;
                // this._previousSetRequestHeader = xhrSource.prototype.setRequestHeader;
            } 
            
            //todo catch send to get posted data
            //see https://msdn.microsoft.com/en-us/library/hh772834(v=vs.85).aspx
            
            xhrSource.prototype.open = function() {
                data.id = VORLON.Tools.CreateGUID();
                data.method = arguments[0];
                data.url = arguments[1];
                that.trace('request for ' + data.url);
                that.sendCommandToDashboard('xhr', data);
                
                this.addEventListener('readystatechange', function() {
                    var xhr = this;
                    
                    data.readyState = xhr.readyState;
                    that.trace('STATE CHANGED ' + data.readyState);

                    if (data.readyState === 4){
                        data.responseType = xhr.responseType;
                        data.status = xhr.status;    
                        data.statusText = xhr.statusText;
                        data.response = JSON.stringify(xhr.response);
                        data.responseText = JSON.stringify(xhr.responseText);
                        data.responseXML = JSON.stringify(xhr.responseXML);
                        
                        if (xhr.getAllResponseHeaders)     
                            data.responseHeaders = xhr.getAllResponseHeaders();
                        
                        that.trace('LOADED !!!');
                    }
                    that.sendCommandToDashboard('xhr', data);
                });

                this.addEventListener("load", function() {
                    var xhr = this;

                    data.response = JSON.stringify(xhr.response);
                    data.responseText = JSON.stringify(xhr.responseText);
                    data.responseXML = JSON.stringify(xhr.responseXML);

                    that.sendCommandToDashboard('xhr', data);
                });
                
                return that._previousOpen.apply(this, arguments);
            }

            // FIXME // TODO temporary commented cause for some reason breaks on orsay
            // xhrSource.prototype.setRequestHeader = function() {
            //     var header = {
            //         name : arguments[0],
            //         value : arguments[1]
            //     }
            //     data.requestHeaders.push(header);
            //     if (this._previousSetRequestHeader) {
            //         return this._previousSetRequestHeader.apply(this, arguments);
            //     }
            // }

        }

        public setupXMLHttpRequestHook(){
            var xhrSource;
            
            if (!Tools.IsWindowAvailable) {
                if (!this._hookAlreadyDone) {
                    this._hookAlreadyDone = true;
                    var path = require("path");
                    var requireHook = require("require-hook");
                    requireHook.attach(path.resolve())
                    var that = this;
                    requireHook.setEvent(function(result, e){
                        if (that.hooked && e.require === "xhr2") {
                            that._xhrSource = result;
                            that._hookPrototype(that, result);
                        }
                        return result;                        
                    });                    
                }
            } else {
                this._xhrSource = XMLHttpRequest;
                this._hookPrototype(this, XMLHttpRequest);
            }          
      
            this.hooked = true;
            this.sendStateToDashboard();
        }

        public removeXMLHttpRequestHook() {
            if (this.hooked) {
                this.trace('xhrPanel remove hook');
                
                var xhrSource = this._xhrSource;
                xhrSource.prototype.open = this._previousOpen;
                xhrSource.prototype.setRequestHeader = this._previousSetRequestHeader;
                
                this.hooked = false;
                this.sendStateToDashboard();
            }
        }

        private _render(tagname: string, parentNode:HTMLElement, classname?:string, value?: string): HTMLElement {
            var elt = document.createElement(tagname);
            elt.className = classname || '';
            if (value)
                elt.innerHTML = value;
            parentNode.appendChild(elt);
            return elt;
        }

        public setupFetchHook() {
            const that = this;

            const data = {
                id: VORLON.Tools.CreateGUID(),
                url: null,
                status : null,
                statusText : null,
                method: null,
                responseType: null,
                responseHeaders : null,
                requestHeaders : [],
                readyState: 0,
                response: null,
                responseText: null,
                responseXML: null,
            };
            this.cache.push(data);

            this._fetch = (window as any).fetch.bind(window);
            (window as any).fetch = (...props) => {
                data.id = VORLON.Tools.CreateGUID();
                data.method = props[0].method;
                data.url = props[0].url;

                this.trace('request for ' + data.url);
                this.sendCommandToDashboard('xhr', data);

                return this._fetch(...props)
                    .then((res) => {
                        data.status = res.status;
                        data.statusText = res.statusText;

                        that.sendCommandToDashboard('xhr', data);

                        const res2 = res.clone()
                        return res.json()
                            .then((body, ...props) => {
                                data.readyState = 4;
                                data.response = JSON.stringify(body);
                                that.sendCommandToDashboard('xhr', data);

                                return res2;
                            });
                    });
            }

            this.hooked = true;
            this.sendStateToDashboard();
        }

        public startClient() {
            this.setupXMLHttpRequestHook();
        }
    }

    const plugin = new XHRPanelClient();

    XHRPanelClient.prototype.ClientCommands = {
        start: () => plugin.startClient(),
        stop: function (data: any) {
            var plugin = <XHRPanelClient>this;
            plugin.removeXMLHttpRequestHook();
        },
        getState: function (data: any) {
            var plugin = <XHRPanelClient>this;
            plugin.sendStateToDashboard();
        },
        clear: function (data: any) {
            var plugin = <XHRPanelClient>this;
            plugin.clearClientCache();
        }
    };
    
    //Register the plugin with vorlon core
    Core.RegisterClientPlugin(plugin);
    if (Tools.IsWindowAvailable && (window as any).fetch) {
        plugin.setupFetchHook();
    } else {
        plugin.setupXMLHttpRequestHook();
    }
}
