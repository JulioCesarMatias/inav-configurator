/*global chrome */
'use strict';

TABS.calibration = {};

TABS.calibration.model = (function () {
    var publicScope = {},
        privateScope = {};

    privateScope.step = null;

    publicScope.next = function () {

        if (privateScope.step === null) {
            privateScope.step = 1;
        } else {
            var count = 0;
            for (var i = 0; i < 6; i++) {
                if (CALIBRATION_DATA.acc['Pos' + i] === 1) {
                    count++;
                }
            }

            privateScope.step = count;
        }

        console.log(privateScope.step);

        if (privateScope.step > 5) {
            privateScope.step = null;
        }

        return privateScope.step;
    };

    publicScope.getStep = function () {
        return privateScope.step;
    };

    return publicScope;
})();

TABS.calibration.initialize = function (callback) {

    var loadChainer = new MSPChainerClass(),
        saveChainer = new MSPChainerClass(),
        modalStart,
        modalStop,
        modalProcessing;

    if (GUI.active_tab != 'calibration') {
        GUI.active_tab = 'calibration';
        googleAnalytics.sendAppView('Calibration');
    }
    loadChainer.setChain([
        mspHelper.queryFcStatus,
        mspHelper.loadSensorConfig,
        mspHelper.loadCalibrationData
    ]);
    loadChainer.setExitPoint(loadHtml);
    loadChainer.execute();

    saveChainer.setChain([
        mspHelper.saveCalibrationData,
        mspHelper.saveToEeprom
    ]);
    saveChainer.setExitPoint(reboot);

    function reboot() {
        //noinspection JSUnresolvedVariable
        GUI.log(chrome.i18n.getMessage('configurationEepromSaved'));

        GUI.tab_switch_cleanup(function () {
            MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false, reinitialize);
        });
    }

    function reinitialize() {
        //noinspection JSUnresolvedVariable
        GUI.log(chrome.i18n.getMessage('deviceRebooting'));
        GUI.handleReconnect($('.tab_calibration a'));
    }

    function loadHtml() {
        GUI.load("./tabs/calibration.html", processHtml);
    }

    function updateCalibrationSteps() {
        for (var i = 0; i < 6; i++) {
            var $element = $('[data-step="' + (i + 1) + '"]');

            if (CALIBRATION_DATA.acc['Pos' + i] === 0) {
                $element.removeClass('finished').removeClass('active');
            } else {
                $element.addClass("finished").removeClass('active');
            }
        }
    }

    function updateSensorData() {
        var pos = ['X', 'Y', 'Z'];
        pos.forEach(function (item) {
            $('[name=accGain' + item + ']').val(CALIBRATION_DATA.accGain[item]);
            $('[name=accZero' + item + ']').val(CALIBRATION_DATA.accZero[item]);
            $('[name=MagOffSet' + item + ']').val(CALIBRATION_DATA.magOffSet[item]);
            $('[name=MagDiagonal' + item + ']').val(CALIBRATION_DATA.magDiagonal[item]);
            $('[name=MagOffDiagonal' + item + ']').val(CALIBRATION_DATA.magOffDiagonal[item]);
        });
        $('[name=MagScaleFactor]').val(CALIBRATION_DATA.MagScaleFactor.ScaleFactor);
        $('[name=OpflowScale]').val(CALIBRATION_DATA.opflow.Scale);
        updateCalibrationSteps();
    }

    function checkFinishAccCalibrate() {
        if (TABS.calibration.model.next() === null) {
            modalStop = new jBox('Modal', {
                width: 400,
                height: 200,
                animation: false,
                closeOnClick: false,
                closeOnEsc: false,
                content: $('#modal-acc-calibration-stop')
            }).open();
        }
        updateSensorData();
    }

    function calibrateNew() {
        var newStep = null,
            $button = $(this);

        if (TABS.calibration.model.getStep() === null) {
            for (var i = 0; i < 6; i++) {
                if (CALIBRATION_DATA.acc['Pos' + i] === 1) {
                    CALIBRATION_DATA.acc['Pos' + i] = 0;
                }
            }
            updateCalibrationSteps();
            modalStart = new jBox('Modal', {
                width: 400,
                height: 200,
                animation: false,
                closeOnClick: false,
                closeOnEsc: false,
                content: $('#modal-acc-calibration-start')
            }).open();
        } else {
            newStep = TABS.calibration.model.next();
        }

        /*
         * Communication
         */
        if (newStep !== null) {
            $button.addClass('disabled');

            modalProcessing = new jBox('Modal', {
                width: 400,
                height: 100,
                animation: false,
                closeOnClick: false,
                closeOnEsc: false,
                content: $('#modal-acc-processing')
            }).open();

            MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, function () {
                GUI.log(chrome.i18n.getMessage('initialSetupAccelCalibStarted'));
            });

            helper.timeout.add('acc_calibration_timeout', function () {
                $button.removeClass('disabled');

                modalProcessing.close();
                MSP.send_message(MSPCodes.MSP_CALIBRATION_DATA, false, false, checkFinishAccCalibrate);
                GUI.log(chrome.i18n.getMessage('initialSetupAccelCalibEnded'));
            }, 2000);
        }
    }

    function setupCalibrationButton(callback) {
        if (FC.getAccelerometerCalibrated()) {
            $('#calibrate-start-button').html(chrome.i18n.getMessage("AccResetBtn"));
            $('#calibrate-start-button').prop("title", chrome.i18n.getMessage("AccResetBtn"));
            $('#calibrate-start-button').removeClass("calibrate");
            $('#calibrate-start-button').addClass("resetCalibration");
        } else {
            $('#calibrate-start-button').html(chrome.i18n.getMessage("AccBtn"));
            $('#calibrate-start-button').prop("title", chrome.i18n.getMessage("AccBtn"));
            $('#calibrate-start-button').addClass("calibrate");
            $('#calibrate-start-button').removeClass("resetCalibration");
        }

        if (callback) callback();
    }

    function actionCalibrateButton(callback) {
        if ($('#calibrate-start-button').hasClass("resetCalibration")) {
            resetAccCalibration();
        } else {
            calibrateNew();
        }

        if (callback) callback();
    }

    function resetAccCalibration() {
        var pos = ['X', 'Y', 'Z'];
        pos.forEach(function (item) {
            CALIBRATION_DATA.accGain[item] = 4096;
            CALIBRATION_DATA.accZero[item] = 0;
        });

        saveChainer.execute();
    }

    function processHtml() {
        $('#calibrateButtonSave').on('click', function () {
            CALIBRATION_DATA.opflow.Scale = parseFloat($('[name=OpflowScale]').val());
            saveChainer.execute();
        });

        if (SENSOR_CONFIG.magnetometer === 0) {
            //Comment for test
            $('#mag_btn, #mag-calibrated-data').css('pointer-events', 'none').css('opacity', '0.4');
        }

        if (SENSOR_CONFIG.opflow === 0) {
            //Comment for test
            $('#opflow_btn, #opflow-calibrated-data').css('pointer-events', 'none').css('opacity', '0.4');
        }

        $('#mag_btn').on('click', function () {
            MSP.send_message(MSPCodes.MSP_MAG_CALIBRATION, false, false, function () {
                GUI.log(chrome.i18n.getMessage('initialSetupMagCalibStarted'));
            });

            var button = $(this);

            $(button).addClass('disabled');

            let modalProcessing = new jBox('Modal', {
                width: 400,
                height: 540,
                animation: false,
                closeOnClick: false,
                closeOnEsc: false,
                content: $('#modal-compass-processing').clone()
            }).open();

            var MagCalibrationFinished = CALIBRATION_DATA.MagReportAndState.Finished;

            //if (MagCalibrationFinished === 0) {
            /*$(button).removeClass('disabled');

            modalProcessing.close();
            GUI.log(chrome.i18n.getMessage('initialSetupMagCalibEnded'));

            MSP.send_message(MSPCodes.MSP_CALIBRATION_DATA, false, false, updateSensorData);

            //Cleanup
            delete modalProcessing;
            $('.jBox-wrapper').remove();*/
            //} else {
            helper.interval.add('compass_calibration_msp_interval', function () {

                /*modalProcessing.content.find('.modal-compass-Off-Set-X').text("Off-Set X:" + $('[name=MagOffSetX').val(CALIBRATION_DATA.magOffSet[0]));
                modalProcessing.content.find('.modal-compass-Off-Set-Y').text("Off-Set Y:" + $('[name=MagOffSetY').val(CALIBRATION_DATA.magOffSet[1]));
                modalProcessing.content.find('.modal-compass-Off-Set-Z').text("Off-Set Z:" + $('[name=MagOffSetZ').val(CALIBRATION_DATA.magOffSet[2]));

                modalProcessing.content.find('.modal-compass-Diagonal-X').text("Diagonal X:" + $('[name=MagDiagonalX').val(CALIBRATION_DATA.magDiagonal[0]));
                modalProcessing.content.find('.modal-compass-Diagonal-Y').text("Diagonal Y:" + $('[name=MagDiagonalY').val(CALIBRATION_DATA.magDiagonal[1]));
                modalProcessing.content.find('.modal-compass-Diagonal-Z').text("Diagonal Z:" + $('[name=MagDiagonalZ').val(CALIBRATION_DATA.magDiagonal[2]));

                modalProcessing.content.find('.modal-compass-Off-Diagonal-X').text("Off Diagonal X:" + $('[name=MagOffDiagonalX').val(CALIBRATION_DATA.magOffDiagonal[0]));
                modalProcessing.content.find('.modal-compass-Off-Diagonal-Y').text("Off Diagonal Y:" + $('[name=MagOffDiagonalY').val(CALIBRATION_DATA.magOffDiagonal[1]));
                modalProcessing.content.find('.modal-compass-Off-Diagonal-Z').text("Off Diagonal Z:" + $('[name=MagOffDiagonalZ').val(CALIBRATION_DATA.magOffDiagonal[2]));*/

                modalProcessing.content.find('.modal-compass-ScaleFactor').text("Scale Factor:" + $('[name=MagScaleFactor]').val(CALIBRATION_DATA.ScaleFactor));

                modalProcessing.content.find('.modal-compass-Fitness').text("Fitness:" + CALIBRATION_DATA.MagReportAndState.Fitness);

                modalProcessing.content.find('.modal-compass-Attempt').text("Attempt:" + CALIBRATION_DATA.MagReportAndState.Attempt);

                modalProcessing.content.find('.modal-compass-Fitness').text("Status:" + CALIBRATION_DATA.MagReportAndState.Status);

                modalProcessing.content.find('.modal-compass-Attempt').text("FitStep:" + CALIBRATION_DATA.MagReportAndState.FitStep);

                modalProcessing.content.find('.modal-compass-OriginalOrientation').text("Original Orientation:" + CALIBRATION_DATA.MagReportAndState.OriginalOrientation);

                modalProcessing.content.find('.modal-compass-NewOrientation').text("New Orientation:" + CALIBRATION_DATA.MagReportAndState.NewOrientation);

                modalProcessing.content.find('.modal-compass-PercentageCompletion').text("Percentage Completion:");

                var progressLabel = $('.progressLabel');
                var progressBar = $('.progress');
                progressLabel.text(CALIBRATION_DATA.MagReportAndState.PercentageCompletion);
                progressBar.val(CALIBRATION_DATA.MagReportAndState.PercentageCompletion);

                if (CALIBRATION_DATA.MagReportAndState.PercentageCompletion === 100) {
                    //helper.interval.remove('compass_calibration_msp_interval');
                }

                MSP.send_message(MSPCodes.MSP_CALIBRATION_DATA, false, false, updateSensorData);
            }, 250);
            //}
        });

        $('#opflow_btn').on('click', function () {
            MSP.send_message(MSPCodes.MSP2_INAV_OPFLOW_CALIBRATION, false, false, function () {
                GUI.log(chrome.i18n.getMessage('initialSetupOpflowCalibStarted'));
            });

            var button = $(this);

            $(button).addClass('disabled');

            modalProcessing = new jBox('Modal', {
                width: 400,
                height: 100,
                animation: false,
                closeOnClick: false,
                closeOnEsc: false,
                content: $('#modal-opflow-processing')
            }).open();

            var countdown = 30;
            helper.interval.add('opflow_calibration_interval', function () {
                countdown--;
                $('#modal-opflow-countdown').text(countdown);
                if (countdown === 0) {
                    $(button).removeClass('disabled');

                    modalProcessing.close();
                    GUI.log(chrome.i18n.getMessage('initialSetupOpflowCalibEnded'));
                    MSP.send_message(MSPCodes.MSP_CALIBRATION_DATA, false, false, updateSensorData);
                    helper.interval.remove('opflow_calibration_interval');
                }
            }, 1000);
        });

        $('#modal-start-button').click(function () {
            modalStart.close();
            TABS.calibration.model.next();
        });

        $('#modal-stop-button').click(function () {
            modalStop.close();
        });

        // translate to user-selected language
        localize();

        setupCalibrationButton();
        $('#calibrate-start-button').on('click', actionCalibrateButton);

        MSP.send_message(MSPCodes.MSP_CALIBRATION_DATA, false, false, updateSensorData);

        GUI.content_ready(callback);
    }
};

TABS.calibration.cleanup = function (callback) {
    if (callback) callback();
};
