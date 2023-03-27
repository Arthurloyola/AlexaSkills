/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');
const AWS = require('aws-sdk');
const dotenv = require('dotenv');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');
const luxon = require('luxon');
const ics = require('ics');
const { google } = require('googleapis');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

/* LANGUAGE STRINGS */
const languageStrings = require('./languages/languageStrings');

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = 'Olá, no que posso te ajudar?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};


const ReadMedicamentoLaunchResquestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LerMedicamentosIntent';
    },
    async handle(handlerInput)
    {   
        // Pega a persistencia do S3
        const attributesManager = handlerInput.attributesManager;
        // Pegar lista de medicamentos que já está cadastrado no S3
        var medicamentos = await attributesManager.getPersistentAttributes() || {};
        
        var speakOutput;
        
        // Se a na nossa persistencia de dados no S3 não tiver o nome da lista, que é chamado 'lista', 
        // significa que não foi criado nenhuma, ou seja, não tem nenhum medicamento cadastrado. Se não
        // ele vai para o else
        if(!medicamentos.hasOwnProperty('lista'))
        {
            speakOutput = 'Ainda não há medicamentos cadastrados';
        }
        else
        {
            speakOutput = 'Seus medicamentos cadastrados são: ';
            // Mesma coisa que:     i = 0
            //                      for(m = 0; m <= medicamentos.lista.lenght; m++)
            //                          i++;
            medicamentos.lista.forEach((m, i) =>
            {
                // pega o nome do medicamento na posição m e soma com o oque já está escrito no speakOutput
                speakOutput += m.nome;
                // se o i for menor que o tamanho da lista - 2, coloca/soma uma vírgula após inserir o nome do medicamento pego anteriormente
                if(i < medicamentos.lista.length - 2)
                    speakOutput += ', ';
                // se o i for igual ao tamanho da lista - 2 ele coloca um e, significando que esse é o penúltimo medicamento cadastrado    
                else if(i === medicamentos.lista.length - 2)
                    speakOutput += ' e ';
                // se não, ele coloca um ponto final, que significa que acabou a lista de medicamentos cadastrados
                else
                    speakOutput += '.';
            });
        }
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
}

const CadastrarMedicamentosIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CadastrarMedicamentoIntent';
    },
    async handle(handlerInput)
    {
        const attributesManager = handlerInput.attributesManager;
        
        const intentValues = handlerInput.requestEnvelope.request.intent.slots;
        const medicamentosTeste = intentValues.medicamento.resolutions.resolutionsPerAuthority[0].values[0].value;
        
        // Pegar lista de medicamentos
        
        var medicamentos = await attributesManager.getPersistentAttributes() || {};
        
        // Pegar medicamento
        const nomeMedicamento = handlerInput.requestEnvelope.request.intent.slots.medicamento.value;
        const horario = handlerInput.requestEnvelope.request.intent.slots.hora.value;
        // Caso não exista medicamento, cria um novo campo para armazená-los
        if(!medicamentos.hasOwnProperty('lista'))
            medicamentos.lista = [];
        
        // Verificar existência do medicamento
        var existe = false;
        for(const m of medicamentos.lista)
            if(m.nome === nomeMedicamento) {
                existe = true;
                break;
            }
        
        var speakOutput;
        //se a variavel "existe" não for true, ou seja, se o medicamento ainda não foi cadastrado, ele cadastra. Se não, ele vai para o else e fala que já foi cadastrado.
        if(!existe && medicamentos !== medicamentosTeste)
        {
            // Adicionar medicamento à lista
            const medicamento = {
                nome: nomeMedicamento,
                hora: horario,
                status: 0
            };
            //o .push é o que faz o medicamento ser salvo no final da lista
            medicamentos.lista.push(medicamento);
            
            //aqui é que faz Persistir os medicamentos no S3
            attributesManager.setPersistentAttributes(medicamentos);
            await attributesManager.savePersistentAttributes();
        
            speakOutput += `O medicamento ${nomeMedicamento}  foi cadastrado com sucesso para ser tocado a cada ${horario} horas! `;
        }
        else
            speakOutput = `Ops! O medicamento ${nomeMedicamento} já foi cadastrado anteriormente.`;
            
        //retorna o speakOutput
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
        
    }
};

const LoadRepeticaoInterceptor = {
    async process(handlerInput){
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = await attributesManager.getPersistentAttributes() || {};
        
        const medicamento = sessionAttributes.hasOwnProperty('medicamento') ? sessionAttributes.medicamento : 0;
        
        if(medicamento){
            attributesManager.setSessionAttributes(sessionAttributes);
        }
    }
}

const MedicamentosConsumidosIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'MedicamentosConsumidosIntent';
    },
    async handle(handlerInput)
    {   
        // Pega a persistencia do S3
        const attributesManager = handlerInput.attributesManager;
        var medicamentos = await attributesManager.getPersistentAttributes() || {};
        
        const filtrados = medicamentos.lista.filter(item => item.status > 0);
        
        var speakOutput = 'Seus medicamentos tomados hoje são: ';
        filtrados.forEach((item, i) =>
        {
            if(item.status > 0)
            {
                speakOutput += item.nome;
                
                if(item.status > 1)
                    speakOutput += ` (${item.status})`;
                
                if(i < filtrados.length - 2)
                    speakOutput += ', ';
                else if(i < filtrados.length - 1)
                    speakOutput += ' e ';
            }
        });
            
        //retorna o speakOutput
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
}

const AlterarHorarioIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AlterarHorarioIntent';
    },
    async handle(handlerInput)
    {   
        // Pega a persistencia do S3
        const attributesManager = handlerInput.attributesManager;
        var medicamentos = await attributesManager.getPersistentAttributes() || {};
        const nomeMedicamento = handlerInput.requestEnvelope.request.intent.slots.medicamento.value;
        const horario = handlerInput.requestEnvelope.request.intent.slots.hora.value;
        
        const filtrados = medicamentos.lista.filter(item => item.nome === nomeMedicamento);
        
        var speakOutput = `Ok então! O medicamento ${nomeMedicamento} foi alterado de: `;
        filtrados.forEach((item, i) =>
        {
            speakOutput += `${item.hora} horas para ${horario} horas! ` ;
                    
            item.hora = `${horario}`;
            
        });
        
        attributesManager.setPersistentAttributes(medicamentos);
        await attributesManager.savePersistentAttributes();
            
        //retorna o speakOutput
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
}

const QualHorarioIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LerUmMedicamentoIntent';
    },
    async handle(handlerInput)
    {   
        // Pega a persistencia do S3
        const attributesManager = handlerInput.attributesManager;
        var medicamentos = await attributesManager.getPersistentAttributes() || {};
        const nomeMedicamento = handlerInput.requestEnvelope.request.intent.slots.medicamento.value;
        
        // Verificar existência do medicamento
        var existe = false;
        for(const m of medicamentos.lista)
            if(m.nome === nomeMedicamento) {
                existe = true;
                break;
            }
        var speakOutput;
            
        if(existe){
        
            const filtrados = medicamentos.lista.filter(item => item.nome === nomeMedicamento);
            
            speakOutput = `O ${nomeMedicamento} está para ser tocado a cada `;
            
            filtrados.forEach((item) =>
            {
                speakOutput += `${item.hora} horas!` 
            });
        
        }else   
            speakOutput = `Ops! O medicamento ${nomeMedicamento} não foi encontrado na sua lista de medicamentos.`;
            
        //retorna o speakOutput
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
}

const MedicamentosDetalhadosIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LerMedicamentosDetalhadosIntent';
    },
    async handle(handlerInput)
    {   
        // Pega a persistencia do S3
        const attributesManager = handlerInput.attributesManager;
        var medicamentos = await attributesManager.getPersistentAttributes() || {};
        
        var speakOutput;
        
        const filtrados = medicamentos.lista;
        
       
            filtrados.forEach((item) =>
            {
                speakOutput += ` O ${item.nome} está para ser tocado a cada `;
                speakOutput += `${item.hora} horas e foi tomado hoje `;
                speakOutput += `${item.status} vezes. `;
            });
            
        
        
        //retorna o speakOutput
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
}

const RegistrarMedicamentoTomadoIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RegistrarMedicamentoTomadoIntent';
    },
    async handle(handlerInput)
    {   
        // Pega a persistencia do S3
        const attributesManager = handlerInput.attributesManager;
        var medicamentos = await attributesManager.getPersistentAttributes() || {};
        const nomeMedicamento = handlerInput.requestEnvelope.request.intent.slots.medicamento.value;
        
        var speakOutput;
        
        var index = -1;
        medicamentos.lista.find((item , i) => {
            if(item.nome === nomeMedicamento){
                index = i;
                return i;
            }
        });
        
        // Se o medicamento foi encontrado entre os cadastrados
        if(index > -1)
        {
           medicamentos.lista[index].status++;
           
           attributesManager.setPersistentAttributes(medicamentos);
           await attributesManager.savePersistentAttributes();
    
           speakOutput += `Ok! O ${nomeMedicamento}  foi tomado.`;
        }
        else
            speakOutput += `Ops! O medicamento ${nomeMedicamento} não foi encontrado na sua lista de medicamentos.`;
            
        //retorna o speakOutput
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
}

const MedicamentosRestantesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'MedicamentosRestantesIntent';
    },
    async handle(handlerInput)
    {   
        // Pega a persistencia do S3
        const attributesManager = handlerInput.attributesManager;
        var medicamentos = await attributesManager.getPersistentAttributes() || {};
        
        const filtrados = medicamentos.lista.filter(item => item.status === 0);
        
        var speakOutput = 'Seus medicamentos ainda não tomados hoje são: ';
        filtrados.forEach((item, i) =>
        {
            
            speakOutput += item.nome;
                    
            if(i < filtrados.length - 2)
                speakOutput += ', ';
            else if(i < filtrados.length - 1)
                speakOutput += ' e ';
        
        });
            
        //retorna o speakOutput
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
}

const MedicamentosdoDiaIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'MedicamentosDoDiaIntent';
    },
    async handle(handlerInput)
    {   
        // Pega a persistencia do S3
        const attributesManager = handlerInput.attributesManager;
        var medicamentos = await attributesManager.getPersistentAttributes() || {};
        
        const filtrados = medicamentos.lista.filter(item => item.status === 0 || item.status > 0);
        
        var speakOutput = 'Seus medicamentos do dia são: ';
        filtrados.forEach((item, i) =>
        {
            
            speakOutput += item.nome;
            speakOutput += ` e já foi tomado ${item.status} vezes`
                    
            if(i < filtrados.length - 2)
                speakOutput += ', ';
            else if(i < filtrados.length - 1)
                speakOutput += ' e ';
        
        });
            
        //retorna o speakOutput
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
}

const RemoverMedicamentoLaunchResquestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RemoverMedicamentoIntent';
    },
    async handle(handlerInput)
    {   
        // Pega a persistencia do S3
        const attributesManager = handlerInput.attributesManager;
        var medicamentos = await attributesManager.getPersistentAttributes() || {};
        const nomeMedicamento = handlerInput.requestEnvelope.request.intent.slots.medicamento.value;
        
        
        
     // Verificar existência do medicamento
        var existe = false;
        for(const m of medicamentos.lista)
            if(m.nome === nomeMedicamento) {
                existe = true;
                break;
            }
        
        var speakOutput;
        //se a variavel "existe"  for true, ou seja, se o medicamento foi cadastrado, ele exclui. Se não, ele vai para o else e fala que não tem esse medicamento.
            if(existe){
            //o index procura o medicamento na lista, e o splice é o que faz o medicamento ser excluido
            
            var index = -1;
            medicamentos.lista.find((item , i) => {
                if(item.nome === nomeMedicamento){
                    index = i;
                    return i;
                }
            })
            
           if (index > -1) {
               medicamentos.lista.splice(index, 1);
            }
            
            //faz Persistir os medicamentos no S3
            attributesManager.setPersistentAttributes(medicamentos);
            await attributesManager.savePersistentAttributes();
        
            speakOutput += `O medicamento ${nomeMedicamento}  foi excluido com sucesso!`;
        }else{
            speakOutput += `Ops! O medicamento ${nomeMedicamento} não foi encontrado na sua lista de medicamentos.`;
        }
        //retorna o speakOutput
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
        
    }
}


const AgendarMedicamentosIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AgendarMedicamentosIntent';
  },
  async handle(handlerInput)
    {
        const attributesManager = handlerInput.attributesManager;
        const intentValues = handlerInput.requestEnvelope.request.intent.slots;
        
        // Pegar lista de medicamentos
        var medicamentos = await attributesManager.getPersistentAttributes() || {};
        
        // Pegar medicamento
        const nomeMedicamento = intentValues.medicamento.value;
        const horario         = intentValues.hora.value;
        const dia             = intentValues.dia.value;
        
        // Caso não exista medicamento, cria um novo campo para armazená-los
        if(!medicamentos.hasOwnProperty('agenda'))
            medicamentos.agenda = [];
        
        // Verificar existência do medicamento
        var existe = false;
        for(const m of medicamentos.agenda)
            if(m.nome === nomeMedicamento) {
                existe = true;
                break;
            }
        
        var speakOutput;
        //se a variavel "existe" não for true, ou seja, se o medicamento ainda não foi cadastrado, ele cadastra. Se não, ele vai para o else e fala que já foi cadastrado.
        if(!existe)
        {
            // Adicionar medicamento à lista
            const medicamento = {
                nome: nomeMedicamento,
                hora: horario,
                dia: dia
            };
            //o .push é o que faz o medicamento ser salvo no final da lista
            medicamentos.agenda.push(medicamento);
            
            //aqui é que faz Persistir os medicamentos no S3
            attributesManager.setPersistentAttributes(medicamentos);
            await attributesManager.savePersistentAttributes();
        
            speakOutput += `O medicamento ${nomeMedicamento}  foi agendado com sucesso para ser tocado no ${dia} ás ${horario} horas! `;
        }
        else
            speakOutput = `Ops! O medicamento ${nomeMedicamento} já foi agendado anteriormente.`;
            
        //retorna o speakOutput
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
        
    }
};




const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'You can say hello to me! How can I help?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Até mais!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Desculpe, eu não entendi o que disse. Pode repetir?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents 
 * by defining them above, then also adding them to the request handler chain below 
 * */
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;
        

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'Não existe nenhum medicamento com esse nome cadastrado!!';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};



/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .withPersistenceAdapter(
        new persistenceAdapter.S3PersistenceAdapter({bucketName:process.env.S3_PERSISTENCE_BUCKET})
    )
    .addRequestHandlers(
        LaunchRequestHandler,
        ReadMedicamentoLaunchResquestHandler,
        CadastrarMedicamentosIntentHandler,
        MedicamentosConsumidosIntentHandler,
        MedicamentosRestantesIntentHandler,
        MedicamentosDetalhadosIntentHandler,
        AlterarHorarioIntentHandler,
        MedicamentosdoDiaIntentHandler,
        QualHorarioIntentHandler,
        RegistrarMedicamentoTomadoIntentHandler,
        RemoverMedicamentoLaunchResquestHandler,
        AgendarMedicamentosIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler
    )
    .addRequestInterceptors(
        LoadRepeticaoInterceptor,
    )
    .addErrorHandlers(
        ErrorHandler
    )
    .lambda();