require([
  'hyprlivecontext',
  'underscore', 
  'modules/jquery-mozu',
  'modules/backbone-mozu',
  'modules/api'
], 
function (HyprLiveContext, _, $, Backbone, api) {

//shippingAddress = "SHIPPING_INFO"
//shippingInfo = "SHIPPING_METHOD"
//paymentInfo = "PAYMENT"

 var brontoCartWidget = {
    phases: {
      SHOPPING : "SHOPPING",
      SHIPPING_ADDRESS : "SHIPPING_INFO",
      SHIPPING_INFO : "SHIPPING_METHOD",
      PAYMENT_INFO : "PAYMENT",
      ORDER_REVIEW : "ORDER_REVIEW",
      ORDER_COMPLETE : "ORDER_COMPLETE"
    },
    init: function(pageContext){
      var user = require.mozuData('user');
      var self = this;
      
      if(pageContext)
        this.pageContext = pageContext;

      function build(){
        self.getOrderOrCart().then(function(order){
          //set global variable, this must match variable set
          //as 'shadowdiv' in Bronto Admin
          var brCart = self._mapToBrontoCart(order, user);
          if(!brCart.lineItems.length)
            return;
          window.brontoCart = brCart;
          
          //load bronto's script
          self._getBrontoScript();
          
          //if checkout set listeners to backbone order object
          if(self._getPageContext().pageType == "checkout"){
            if(window.order && window.order instanceof Backbone.Model){
              window.order.on('change', function(model){
                var changedAttributes = model.changedAttributes();
                if(changedAttributes && changedAttributes.isReady)
                  self.updateCartPhase(self.phases.ORDER_REVIEW);
                else
                  self.updateCartPhase(self.getCheckoutCartPhase());
              });
            }
          }
         }, function(e){
            console.log('Bronto cart widget error getting cart.', e);
         });
      }
      //if checkout page, settimeout for checkout.js to finish
      if(this._getPageContext().pageType == "checkout")
        setTimeout(build, 2000);
      else
        build();
    },
    getCheckoutCartPhase:function(){
      var currentPhase, stepKeys = _.keys(window.checkoutViews.steps);
      var currentKey = _.find(stepKeys, function(stepKey){
        return window.checkoutViews.steps[stepKey].model._stepStatus != "complete";
      });

      if(currentKey){
        switch(currentKey){
          case "shippingAddress":
            currentPhase = this.phases.SHIPPING_ADDRESS;
            break;
          case "shippingInfo":
            currentPhase = this.phases.SHIPPING_INFO;
            break;
          case "paymentInfo":
            currentPhase = this.phases.PAYMENT_INFO;
            break;
          default:
            currentPhase = "";
            break;
        }
      } else{
        currentPhase = this.phases.ORDER_REVIEW;
      }

      return currentPhase;
    },
    updateCartPhase: function(cartPhase){
      console.log(cartPhase + ' updated');
      window.brontoCart.cartPhase = cartPhase;
    },
    getOrderOrCart: function(){
      var deferred = $.Deferred();
      var pageType = this._getPageContext().pageType;
      
      var order;
      
      if(pageType == "cart"){
        order = require.mozuData('cart');
      } else if(pageType == "checkout"){
        order = require.mozuData('checkout');
      } else if(pageType == "confirmation"){
        order = require.mozuData('order');
      }

      if(!order)
        api.get('cart').then(function(cartResponse){
          deferred.resolve(cartResponse.data);
        }, function(e){
          deferred.reject(e);
        });
      else
        deferred.resolve(order);

      return deferred.promise();
    },
    _getBrontoScript: function(){
      var scriptString = $('[data-bronto-loadjs]').data('bronto-loadjs');
      if(scriptString)
        $('head').append(scriptString);
      else
        console.log('No bronto script found for conversion tracking, please check widget configuration.');
    },
    _getPageContext: function(){
      if(!this.pageContext)
        this.pageContext = require.mozuData('pagecontext');

      return this.pageContext;
    },
    _getCartPhase: function(){
      var cartPhase = "SHOPPING";
      var pageType = this._getPageContext().pageType;
      
      if(pageType == "checkout"){
        cartPhase = this.getCheckoutCartPhase();
      } else if(pageType == "confirmation"){
        cartPhase = this.phases.ORDER_COMPLETE;
      }
      console.log('get cart phase ' + cartPhase);
      return cartPhase;
    },
    _mapToBrontoCart: function(order, user){
        if(order instanceof Backbone.Model)
            order = order.toJSON();

        var pageContext = this._getPageContext();

        var brCart = {
          "cartPhase": this._getCartPhase(),
          "currency": order.currencyCode,
          "subtotal": order.subtotal,
          "discountAmount": order.discountTotal,
          "taxAmount": order.taxTotal,
          "grandTotal": order.total,
          "orderId": order.id,
          //"emailAddress": "example@example.com",  //omit line if value not available
          "cartUrl": this._getPageContext().secureHost + "/cart",
          "lineItems": []
        };
        if(user && user.email && user.email.length)
          brCart.emailAddress = user.email;

        if(order.items && order.items.length){
          _.forEach(order.items, function(lineItem){
            var lineItemProduct = lineItem.product;
            //need to decide how to present this
            var category = _.last(lineItemProduct.categories) ? _.last(lineItemProduct.categories).id : "";
            brCart.lineItems.push(
            {
              "sku": lineItemProduct.productCode,
              "name": lineItemProduct.name,
              "description": lineItemProduct.description,
              "category": category,
              //"other": "",
              "unitPrice": lineItemProduct.price.price,
              "salePrice": lineItemProduct.price.salePrice,
              "quantity": lineItem.quantity,
              "totalPrice": lineItem.total,
              "imageUrl": lineItemProduct.imageUrl,
              "productUrl": window.location.origin + (lineItemProduct.url ? lineItemProduct.url : '/p/' + lineItemProduct.productCode)
            });
          });
        }
        return brCart;
    }
 };


   $(document).ready(function() {
      var pageContext = require.mozuData('pagecontext');
      
       brontoCartWidget.init(pageContext);
    });

});
